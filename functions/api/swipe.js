import { jsonResponse, onRequestOptions as _cors } from "../_shared/ebay.js";
import { saveUserData } from "../_shared/userPreferences.js";
export { _cors as onRequestOptions };
export async function onRequestPost({ env, request }) {
  let body; try { body = await request.json(); } catch { return jsonResponse({ saved: false, error: "Invalid JSON body" }, 400); }
  if (!body?.event || typeof body.event !== "object") return jsonResponse({ saved: false, error: "event is required" }, 400);
  return saveUserData(env, request, body, true);
}