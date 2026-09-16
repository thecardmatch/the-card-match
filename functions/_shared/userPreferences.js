import { createClient } from "@supabase/supabase-js";
import { jsonResponse } from "./ebay.js";

function config(env) {
  const node = typeof process !== "undefined" ? process.env : {};
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || node.SUPABASE_URL || node.VITE_SUPABASE_URL;
  const service = env.SUPABASE_SERVICE_ROLE_KEY || node.SUPABASE_SERVICE_ROLE_KEY;
  const key = service || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || node.SUPABASE_ANON_KEY || node.VITE_SUPABASE_ANON_KEY;
  return { url, key, service };
}
export async function authenticatedClient(env, request, requestedUserId) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { guest: true };
  const { url, key, service } = config(env);
  if (!url || !key) return { error: "missing_supabase_config", status: 503 };
  const client = createClient(url, key, service ? undefined : { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return { error: "invalid_session", status: 401 };
  if (requestedUserId && requestedUserId !== data.user.id) return { error: "Authenticated user does not match request.", status: 403 };
  return { client, userId: data.user.id };
}
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
async function persistCompatibilitySwipe(client, userId, event, preferences) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data: stored, error: readError } = await client.from("user_preferences")
      .select("swipes,updated_at").eq("user_id", userId).maybeSingle();
    if (readError) return { error: readError };
    const priorSwipes = Array.isArray(stored?.swipes) ? stored.swipes : [];
    const byId = new Map(priorSwipes.map((value, index) => [value.eventId || `legacy:${index}`, value]));
    const duplicate = byId.has(event.eventId);
    byId.set(event.eventId, event);
    const timestamp = new Date().toISOString();
    const payload = {
      user_id: userId,
      preferences,
      swipes: [...byId.values()],
      updated_at: timestamp,
    };
    if (!stored) {
      const { error } = await client.from("user_preferences").insert(payload);
      if (!error) return { duplicate };
      if (error.code === "23505") continue;
      return { error };
    }
    let update = client.from("user_preferences").update(payload).eq("user_id", userId);
    if (stored.updated_at) update = update.eq("updated_at", stored.updated_at);
    const { data: updated, error } = await update.select("user_id");
    if (error) return { error };
    if (updated?.length === 1) return { duplicate };
  }
  return { error: { message: "Preference update conflicted repeatedly; retry the swipe." } };
}
export async function saveUserData(env, request, body, includeSwipe = false) {
  const auth = await authenticatedClient(env, request, body.userId);
  if (auth.guest) return jsonResponse({ saved: false, guest: true, status: "not_authenticated" });
  if (auth.error) return jsonResponse({ saved: false, guest: false, status: auth.error, error: auth.error }, auth.status);
  const [{ data: legacy, error }, { data: canonical, error: canonicalError }] = await Promise.all([
    auth.client.from("user_quiz_results").select("preferences,swipes,updated_at").eq("user_id", auth.userId).maybeSingle(),
    auth.client.from("user_preferences").select("preferences,swipes,updated_at").eq("user_id", auth.userId).maybeSingle(),
  ]);
  if (error || canonicalError) return jsonResponse({ saved: false, guest: false, status: "read_failed", error: (error || canonicalError).message }, 500);
  const existing = canonical && (!legacy || Date.parse(canonical.updated_at || 0) >= Date.parse(legacy.updated_at || 0))
    ? canonical : legacy;
  const preferences = { ...object(existing?.preferences), ...object(body.preferences) };
  if (Array.isArray(body.categories)) preferences.selectedCategories = body.categories;
  let normalizedEvent = null;
  if (includeSwipe && body.event && typeof body.event === "object") {
    normalizedEvent = {
      ...body.event,
      eventId: body.event.eventId ||
        `${body.event.cardId || "unknown"}:${body.event.action || "event"}:${body.event.occurredAt || Date.now()}`,
    };
    // Feed swipes are history only; they never change explicit preferences.
  }
  if (!includeSwipe) {
    const { error: canonicalError } = await auth.client.from("user_preferences").upsert({
      user_id: auth.userId, preferences, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (canonicalError) return jsonResponse({ saved: false, guest: false, status: "write_failed", error: canonicalError.message }, 500);
    return jsonResponse({ saved: true, guest: false, status: "persisted_canonical", preferences });
  }
  const compat = await persistCompatibilitySwipe(auth.client, auth.userId, normalizedEvent, preferences);
  if (compat.error) return jsonResponse({ saved: false, guest: false, status: "write_failed", error: compat.error.message }, 500);
  return jsonResponse({ saved: true, guest: false, status: compat.duplicate ? "persisted_duplicate" : "persisted_history", preferences });
}