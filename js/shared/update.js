// New versions. The service worker is cache-first, so a new version installs behind the page that is
// open and takes over at once (skipWaiting, then clients.claim); the page on screen is still the old one.
// This tells the page when that happens: on a screen where nothing can be lost (the signed-out front
// door) it reloads once; anywhere else it shows a chip and leaves the reload to the person, because a
// reload under a half-typed sheet loses it (sent reports are safe in the outbox; typing is not).
// No worker on http (localhost) or without the API: nothing happens, and version() answers null.
export function watchUpdates({ script, mayReload, chip }) {
  const none = { version: () => Promise.resolve(null), check: () => Promise.resolve() };
  if (!('serviceWorker' in navigator) || location.protocol !== 'https:') return none;
  const hadController = !!navigator.serviceWorker.controller;   // false on the very first visit: that take-over is not an update
  let acted = false;
  navigator.serviceWorker.register(script).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || acted) return;
    acted = true;
    if (mayReload()) { location.reload(); return; }
    const c = chip && document.getElementById(chip);
    if (!c) return;
    c.hidden = false;
    const go = c.querySelector('[data-action="update-reload"]'), later = c.querySelector('[data-action="update-later"]');
    if (go) go.addEventListener('click', () => location.reload());
    if (later) later.addEventListener('click', () => { c.hidden = true; });
  });
  return {
    // The version of the worker in control (the shell on screen), asked over a message channel.
    version: () => new Promise((resolve) => {
      const c = navigator.serviceWorker.controller;
      if (!c) return resolve(null);
      const ch = new MessageChannel();
      const t = setTimeout(() => resolve(null), 1500);
      ch.port1.onmessage = (e) => { clearTimeout(t); resolve((e.data && e.data.version) || null); };
      try { c.postMessage({ type: 'version' }, [ch.port2]); } catch (e) { clearTimeout(t); resolve(null); }
    }),
    // Ask the browser to look for a newer worker now (a Reload button does this first, then reloads).
    check: async () => { try { const reg = await navigator.serviceWorker.getRegistration(); if (reg) await reg.update(); } catch (e) { /* offline, or no worker */ } }
  };
}
