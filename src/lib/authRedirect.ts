const PRODUCTION_APP_URL = "https://thecardmatch.com/";

export function getAuthRedirectUrl() {
  return import.meta.env.PROD ? PRODUCTION_APP_URL : window.location.origin;
}