// Light or dark, chosen per device: 'light', 'dark', or nothing stored (follow the system). The
// choice is data-theme on <html>; the two pages set it inline before first paint from the same
// key, so a dark page never flashes light. No imports: the Worker-free rule of js/shared applies.
export const THEME_KEY = 'ic.theme';
const COLORS = { light: '#1F4E79', dark: '#121412' };

export function storedTheme() {
  try { const t = localStorage.getItem(THEME_KEY); return t === 'light' || t === 'dark' ? t : ''; } catch (e) { return ''; }
}
export function systemTheme() {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
// the theme in force: the stored choice, else the system's
export function currentTheme() { return storedTheme() || systemTheme(); }

export function applyTheme(choice) {
  const root = document.documentElement;
  if (choice === 'light' || choice === 'dark') root.dataset.theme = choice; else delete root.dataset.theme;
  try { if (choice === 'light' || choice === 'dark') localStorage.setItem(THEME_KEY, choice); else localStorage.removeItem(THEME_KEY); } catch (e) { /* storage blocked */ }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = COLORS[currentTheme()];
  return currentTheme();
}
// the button on the base: dark when light, light when dark
export function toggleTheme() { return applyTheme(currentTheme() === 'dark' ? 'light' : 'dark'); }
