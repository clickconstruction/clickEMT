// Production Supabase config (charity-tooling project, shared with the charity app; the incident
// tables use the ic_ prefix). This file IS committed on purpose: the site is a static deploy and
// the publishable key is a public, RLS-gated credential. Never put a secret or service-role key
// here. Dev-only overrides go in config.local.js (gitignored, loaded on localhost only).
window.SUPABASE_URL = 'https://cjwybuhogxyayjnuxpem.supabase.co';
window.SUPABASE_ANON_KEY = 'sb_publishable_mY04D4GZBph7ss23Hh_FNg_t34i1uZr';
// Google Maps streets and satellite appear in the map's layer picker when this holds a Google
// Maps Platform key with the Map Tiles API enabled, restricted to this site's address (a browser
// key; billing applies). Empty: Streets (OpenStreetMap) and Satellite (Esri) only.
window.GOOGLE_MAPS_KEY = '';
