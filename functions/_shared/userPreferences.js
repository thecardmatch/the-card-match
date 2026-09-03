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
export async function saveUserData(env, request, body, includeSwipe = false) {
  const auth = await authenticatedClient(env, request, body.userId);
  if (auth.guest) return jsonResponse({ saved: false, guest: true, status: "not_authenticated" });
  if (auth.error) return jsonResponse({ saved: false, guest: false, status: auth.error, error: auth.error }, auth.status);
  const { data: existing, error } = await auth.client.from("user_quiz_results")
    .select("preferences,tag_weights,swipes").eq("user_id", auth.userId).maybeSingle();
  if (error) return jsonResponse({ saved: false, guest: false, status: "read_failed", error: error.message }, 500);
  const preferences = { ...object(existing?.preferences), ...object(body.preferences) };
  if (Array.isArray(body.categories)) preferences.selectedCategories = body.categories;
  const tagWeights = { ...object(existing?.tag_weights), ...object(body.tagWeights), ...object(body.tag_weights) };
  if (includeSwipe && body.event && typeof body.event === "object") {
    const event = {
      ...body.event,
      eventId: body.event.eventId ||
        `${body.event.cardId || "unknown"}:${body.event.action || "event"}:${body.event.occurredAt || Date.now()}`,
    };
    const { error: rpcError } = await auth.client.rpc("record_user_swipe_event", {
      p_user_id: auth.userId,
      p_event: event,
      p_preferences: preferences,
      p_tag_weights: tagWeights,
    });
    if (!rpcError) {
      return jsonResponse({
        saved: true, guest: false, status: "persisted_atomic",
        preferences, tag_weights: tagWeights,
      });
    }
    // Older environments can keep working until the migration is applied.
    if (rpcError.code !== "PGRST202") {
      return jsonResponse({ saved: false, guest: false, status: "write_failed", error: rpcError.message }, 500);
    }
  }
  if (!includeSwipe) {
    const { error: preferenceError } = await auth.client.rpc("merge_user_preferences", {
      p_user_id: auth.userId,
      p_preferences: preferences,
      p_tag_weights: tagWeights,
    });
    if (!preferenceError) {
      return jsonResponse({ saved: true, guest: false, status: "persisted_atomic", preferences, tag_weights: tagWeights });
    }
    if (preferenceError.code !== "PGRST202") {
      return jsonResponse({ saved: false, guest: false, status: "write_failed", error: preferenceError.message }, 500);
    }
    const { error: fallbackError } = await auth.client.from("user_quiz_results").upsert({
      user_id: auth.userId, preferences, tag_weights: tagWeights, updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (fallbackError) return jsonResponse({ saved: false, guest: false, status: "write_failed", error: fallbackError.message }, 500);
    return jsonResponse({ saved: true, guest: false, status: "persisted", preferences, tag_weights: tagWeights });
  }
  let swipes = Array.isArray(existing?.swipes) ? existing.swipes : [];
  if (includeSwipe && body.event && typeof body.event === "object") {
    const event = { ...body.event, eventId: body.event.eventId || `${body.event.cardId || "unknown"}:${body.event.action || "event"}:${body.event.occurredAt || Date.now()}` };
    const byId = new Map(swipes.map((value, index) => [value.eventId || `legacy:${index}`, value]));
    byId.set(event.eventId, event); swipes = [...byId.values()];
  }
  const { error: writeError } = await auth.client.from("user_quiz_results").upsert({
    user_id: auth.userId, preferences, tag_weights: tagWeights, swipes, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (writeError) return jsonResponse({ saved: false, guest: false, status: "write_failed", error: writeError.message }, 500);
  return jsonResponse({ saved: true, guest: false, status: "persisted", preferences, tag_weights: tagWeights });
}