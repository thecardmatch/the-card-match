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
  isSuppliesCategory,
  CATEGORY_FEED_CONFIG,
} from "../../_shared/ebay.js";

export { _cors as onRequestOptions };

// Maps lowercase tag-weight key → CATEGORY_FEED_CONFIG key (matches feed.js)
const CAT_TAG_TO_CONFIG = {
  football:   "Football",
  basketball: "Basketball",
  baseball:   "Baseball",
  hockey:     "Hockey",
  soccer:     "Soccer",
  pokemon:    "Pokemon",
  mtg:        "MTG",
  racing:     "Racing",
  popculture: "PopCulture",
};

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
    // ── 1. Compute preference scores from quiz swipes ─────────────────────────
    const categoryScores = {};
    const eraScores      = {};
    const styleScores    = {};

    for (const s of onboardingSwipes) {
      if (!s || !s.category) continue;
      const delta = s.action === "LIKE" ? 1 : -1;
      categoryScores[s.category] = (categoryScores[s.category] || 0) + delta;

      const era   = s.attributes?.era;
      const style = s.attributes?.style;
      if (era)   eraScores[era]     = (eraScores[era]     || 0) + delta;
      if (style) styleScores[style] = (styleScores[style] || 0) + delta;
    }

    // topCategories: top 3 by score
    const rankedCats = Object.entries(categoryScores).sort((a, b) => b[1] - a[1]);
    const topCategories = rankedCats.slice(0, 3).map(([cat]) => cat);
    const preferences   = { categoryScores, eraScores, styleScores, topCategories };
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
            tag_weights: categoryScores,
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

    // ── 3. Build proportional fetch plan from positively-scored categories ────
    const positiveCats = rankedCats
      .filter(([, score]) => score > 0)
      .filter(([cat]) => {
        const key = cat.toLowerCase().replace(/[\s_]+/g, "-");
        return CAT_TAG_TO_CONFIG[key] && CATEGORY_FEED_CONFIG[CAT_TAG_TO_CONFIG[key]];
      });

    const fetchSource = positiveCats.length > 0
      ? positiveCats
      : rankedCats.slice(0, 2).filter(([cat]) => {
          const key = cat.toLowerCase().replace(/[\s_]+/g, "-");
          return CAT_TAG_TO_CONFIG[key] && CATEGORY_FEED_CONFIG[CAT_TAG_TO_CONFIG[key]];
        });

    if (fetchSource.length === 0) {
      console.warn("[onboarding/complete] no fetchable categories — returning empty cards");
      return jsonResponse({ preferences, cards: [], persistence });
    }

    const totalScore = fetchSource.reduce((sum, [, s]) => sum + s, 0);
    const TARGET     = 60;

    const fetchPlan = fetchSource.map(([cat, score]) => {
      const configKey  = CAT_TAG_TO_CONFIG[cat.toLowerCase().replace(/[\s_]+/g, "-")] || cat;
      const proportion = score / totalScore;
      const budget     = Math.max(15, Math.ceil(TARGET * proportion));
      return { configKey, cat, score, proportion, budget };
    });

    // ── 4. Proportional parallel eBay fetch ───────────────────────────────────
    const token    = await getEbayToken(env);
    const allItems = [];

    await Promise.all(
      fetchPlan.map(async ({ configKey, proportion, budget }) => {
        const cfg = CATEGORY_FEED_CONFIG[configKey];
        if (!cfg) return;
        const { terms, categoryId, minPrice } = cfg;
        const pf = `price:[${minPrice}..],priceCurrency:USD`;

        const termCount = proportion >= 0.45 ? Math.min(2, terms.length) : 1;
        const perTerm   = Math.ceil(budget / termCount);

        const searches = terms.slice(0, termCount).flatMap((term) => [
          ebaySearch(token, term, "endingSoonest", `${pf},buyingOptions:{AUCTION}`,     null, categoryId, Math.ceil(perTerm * 0.65), 0),
          ebaySearch(token, term, "bestMatch",      `${pf},buyingOptions:{FIXED_PRICE}`, null, categoryId, Math.ceil(perTerm * 0.35), 0),
        ]);

        const settled = await Promise.allSettled(searches);
        for (const r of settled) {
          if (r.status !== "fulfilled") continue;
          for (const raw of (r.value.itemSummaries || [])) {
            if (!isSuppliesCategory(raw)) allItems.push(mapFeedItem(raw, [configKey]));
          }
        }
      })
    );

    // ── 5. Deduplicate, score by category affinity, sort, slice ──────────────
    const seen = new Set();
    const now  = Date.now();

    const unique = allItems.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    const scored = unique.map((item) => {
      let urgency = 1;
      if (item.endTime) {
        const hrs = (new Date(item.endTime).getTime() - now) / 3_600_000;
        if (hrs > 0 && hrs < 2)      urgency = 3;
        else if (hrs < 12)         urgency = 2;
      }
      const catScore = categoryScores[item.category] ?? 0;
      return {
        ...item,
        rankScore: (item.engagementScore + Math.max(catScore, 0) * 5) * urgency,
      };
    });

    scored.sort((a, b) => b.rankScore - a.rankScore);
    const cards = scored.slice(0, 40);

    return jsonResponse({ preferences, cards, persistence });

  } catch (err) {
    console.error("[onboarding/complete] CRASH ERROR:", err);
    return jsonResponse({ preferences: null, cards: [], error: err.message }, 500);
  }
}