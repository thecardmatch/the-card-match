/**
 * POST /api/onboarding/complete
 * Receives the onboarding swipes, computes preference scores,
 * saves preferences to Supabase, fetches initial eBay card pool,
 * and returns both the preferences and cards.
 */
import { createClient } from "@supabase/supabase-js";
import {
  jsonResponse,
  onRequestOptions as _cors,
  getEbayToken,
  ebaySearch,
  mapFeedItem,
  enrichFeedItemsWithEngagement,
  isSuppliesCategory,
  CATEGORY_FEED_CONFIG,
} from "../../_shared/ebay.js";
import { FALLBACK_CATEGORIES, buildHotSearchQuery, canonicalFeedItem, hotPriceFilter, meetsHotCardFloor, passesHotEngagement, sortHotCards } from "../../_shared/hotCards.js";
import { isJunk } from "../../_shared/recommendationEngine.js";

export { _cors as onRequestOptions };

function canonicalCategory(category) {
  return { MTG: "Magic: The Gathering", Racing: "F1" }[String(category)] || String(category);
}

export async function onRequestPost(context) {
  // Fall back to process.env if context.env is undefined (Replit / Node runtime)
  const nodeEnv = typeof process !== "undefined" ? process.env : {};
  const env = context?.env || nodeEnv;
  const request = context?.request || context;

  let body = {};
  try { 
    body = await request.json(); 
  } catch { 
    /* empty body fallback */ 
  }

  const { onboardingSwipes = [], userId: requestedUserId = null } = body;
  const authorization = request.headers?.get?.("authorization") || "";
  const accessToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;
  console.log("[onboarding/complete] request:", {
    method: "POST",
    path: "/api/onboarding/complete",
    userId: requestedUserId || null,
    swipeCount: Array.isArray(onboardingSwipes) ? onboardingSwipes.length : 0,
  });

  try {
    // The quiz is only a one-time category picker. Feed swipes never change
    // these preferences or the feed ranking.
    const selectedCategories = [...new Set(
      onboardingSwipes
        .filter((swipe) => swipe?.action === "LIKE" && swipe.category)
        .map((swipe) => canonicalCategory(swipe.category))
        .filter((category) => CATEGORY_FEED_CONFIG[category])
    )];
    const preferences = {
      selectedCategories,
      preferenceMode: selectedCategories.length > 0 ? "selected" : "trending",
      onboardingComplete: true,
    };
    const completedAt   = new Date().toISOString();
    const persistedSwipes = onboardingSwipes.map((swipe, index) => ({
      ...swipe,
      eventId: swipe.eventId || `onboarding:${swipe.cardId}:${swipe.action}:${index}`,
      source: "onboarding",
      occurredAt: swipe.occurredAt || completedAt,
    }));

    // ── 2. Save Preferences & Swipes to Supabase ──────────────────────────────
    const supabaseUrl = env.SUPABASE_URL ||
      env.VITE_SUPABASE_URL ||
      nodeEnv.SUPABASE_URL ||
      nodeEnv.VITE_SUPABASE_URL;
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ||
      nodeEnv.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseKey = serviceRoleKey ||
      env.SUPABASE_ANON_KEY ||
      env.VITE_SUPABASE_ANON_KEY ||
      nodeEnv.SUPABASE_ANON_KEY ||
      nodeEnv.VITE_SUPABASE_ANON_KEY;
    let persistence = { saved: false, reason: "not_authenticated" };

    if (supabaseUrl && supabaseKey && accessToken) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey, serviceRoleKey ? undefined : {
          global: { headers: { Authorization: `Bearer ${accessToken}` } },
        });
        const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
        if (authError || !authData.user) {
          persistence = { saved: false, reason: "invalid_session" };
          console.warn("[onboarding/complete] Supabase session verification failed:", authError?.message);
        } else if (requestedUserId && requestedUserId !== authData.user.id) {
          return jsonResponse({ preferences: null, cards: [], error: "Authenticated user does not match request." }, 403);
        } else {
          const authenticatedUserId = authData.user.id;
          const { data: existing, error: existingError } = await supabase
            .from("user_quiz_results")
            .select("swipes")
            .eq("user_id", authenticatedUserId)
            .maybeSingle();
          if (existingError) throw existingError;

          const mergedById = new Map();
          [...(Array.isArray(existing?.swipes) ? existing.swipes : []), ...persistedSwipes]
            .forEach((swipe, index) => {
              const key = swipe.eventId ||
                `legacy:${swipe.source || "onboarding"}:${swipe.cardId}:${swipe.action}:${swipe.occurredAt || index}`;
              mergedById.set(key, { ...swipe, eventId: key });
            });
          const mergedSwipes = [...mergedById.values()];
          const { error: quizErr } = await supabase.from("user_quiz_results").upsert({
            user_id: authenticatedUserId,
            preferences,
            swipes: mergedSwipes,
            updated_at: new Date().toISOString(),
          }, { onConflict: "user_id" });
          if (quizErr) {
            persistence = { saved: false, reason: quizErr.message };
            console.error("[onboarding/complete] Supabase user_quiz_results write error:", quizErr);
          } else {
            persistence = { saved: true, reason: null };
            console.log("[onboarding/complete] Supabase user_quiz_results write succeeded:", authenticatedUserId);
          }
        }
      } catch (dbErr) {
        persistence = { saved: false, reason: dbErr.message };
        console.error("[onboarding/complete] Supabase write exception:", dbErr);
      }
    } else if (!accessToken) {
      console.warn("[onboarding/complete] No bearer token; skipping server-side DB write.");
    } else {
      persistence = { saved: false, reason: "missing_supabase_config" };
      console.warn("[onboarding/complete] Supabase environment variables missing; skipping DB write.");
    }

    // ── 3. Fetch selected categories or the curated high-end fallback ────────
    const fetchCategories = selectedCategories.length > 0
      ? selectedCategories
      : FALLBACK_CATEGORIES;
    const token    = await getEbayToken(env);
    const allItems = [];
    await Promise.all(
      fetchCategories.map(async (category) => {
        const cfg = CATEGORY_FEED_CONFIG[category];
        if (!cfg) return;
        const searches = [ebaySearch(
          token,
          buildHotSearchQuery(cfg.catTerm),
          "endingSoonest",
          `${hotPriceFilter()},buyingOptions:{AUCTION}`,
          null,
          cfg.categoryId,
          Math.max(20, Math.ceil(40 / fetchCategories.length)),
          0,
        )];

        const settled = await Promise.allSettled(searches);
        for (const r of settled) {
          if (r.status !== "fulfilled") continue;
          for (const raw of (r.value.itemSummaries || [])) {
            if (!isSuppliesCategory(raw)) allItems.push(mapFeedItem(raw, [category]));
          }
        }
      })
    );

    // ── 4. Filter and rank by fixed high-end card signals ────────────────────
    const seen = new Set();
    const unique = allItems.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return meetsHotCardFloor(item) && !isJunk(item);
    });
    const enriched = await enrichFeedItemsWithEngagement(token, unique.slice(0, 120));
    const cards = enriched
      .filter(passesHotEngagement)
      .sort(sortHotCards)
      .slice(0, 40)
      .map(canonicalFeedItem);

    return jsonResponse({ preferences, cards, persistence });

  } catch (err) {
    console.error("[onboarding/complete] CRASH ERROR:", err);
    return jsonResponse({ preferences: null, cards: [], error: err.message }, 500);
  }
}