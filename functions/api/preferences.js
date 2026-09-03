import { jsonResponse, onRequestOptions as _cors } from "../_shared/ebay.js";
import { authenticatedClient, saveUserData } from "../_shared/userPreferences.js";
export { _cors as onRequestOptions };
export async function onRequestGet({ env, request }) {
  const auth = await authenticatedClient(env, request);
  if (auth.guest) return jsonResponse({ authenticated: false, guest: true, preferences: {}, tag_weights: {} });
  if (auth.error) return jsonResponse({ authenticated: false, guest: false, error: auth.error }, auth.status);
  const { data, error } = await auth.client.from("user_quiz_results").select("preferences,tag_weights").eq("user_id", auth.userId).maybeSingle();
  if (error) return jsonResponse({ error: error.message }, 500);
  return jsonResponse({ authenticated: true, preferences: data?.preferences || {}, tag_weights: data?.tag_weights || {} });
}
async function write(context) {
  let body; try { body = await context.request.json(); } catch { return jsonResponse({ saved: false, error: "Invalid JSON body" }, 400); }
  return saveUserData(context.env, context.request, body || {});
}
export { write as onRequestPut, write as onRequestPost };