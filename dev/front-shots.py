#!/usr/bin/env python3
"""The front door's pictures (images/front/), shot from the mock in headless Chrome (v81): the base at 1280 × 800 and
the phone at 375 × 812, both at 2×, light, saved as JPEG at the sizes index.html's img tags carry. Needs the site
served (`npm run serve`, or `PORT=8770 python3 dev/serve.py 8770` for another checkout) and Google Chrome in
/Applications; nothing is installed. Chrome's own screenshot replaces the html2canvas-pro render of v33, which needed
a CORS proxy for the tiles and a fix for the headings' spaces.

    python3 dev/front-shots.py                                  the five pictures, from http://localhost:8766
    python3 dev/front-shots.py --url http://localhost:8770 --port 9352
    python3 dev/front-shots.py base-map phone-par               some of them

The pictures: base-map (the hero: the incident card pinned open, the transport runs on the map), base-codes (step 1:
the codes' card under CEDAR7), base-iap (step 3: the IAP as a window over the map, scrolled to A-1's 204 and its map),
phone-home (the unit's home screen), phone-par (the head count, started from the base tab, so the phone tab must open
after the base tab and share its mock through the BroadcastChannel). Redo them when a screen changes."""
import base64, json, os, shutil, subprocess, sys, tempfile, time, urllib.request
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from importlib import import_module
sh = import_module('smoke-headless')   # the CDP class and Chrome's path

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'images', 'front')
SIZES = { 'base-map': (1600, 1000), 'base-codes': (1600, 1000), 'base-iap': (1600, 1000), 'phone-home': (750, 1624), 'phone-par': (750, 1624) }

def main():
    args = sys.argv[1:]
    url = 'http://localhost:8766'; port = 9352; wanted = []
    while args:
        a = args.pop(0)
        if a == '--url': url = args.pop(0).rstrip('/')
        elif a == '--port': port = int(args.pop(0))
        else: wanted.append(a)
    wanted = wanted or list(SIZES)
    bad = [w for w in wanted if w not in SIZES]
    if bad: sys.exit('not a picture: ' + ', '.join(bad) + ' (one of ' + ', '.join(SIZES) + ')')
    profile = tempfile.mkdtemp(prefix='clickemt-shots-')
    chrome = subprocess.Popen([sh.CHROME, '--headless=new', f'--remote-debugging-port={port}', f'--user-data-dir={profile}',
                               '--window-size=1280,800', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank'],
                              stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    tmp = tempfile.mkdtemp(prefix='clickemt-shots-png-')
    try:
        for _ in range(100):
            try: targets = json.load(urllib.request.urlopen(f'http://127.0.0.1:{port}/json', timeout=2)); break
            except Exception: time.sleep(0.2)
        else: raise RuntimeError('Chrome did not open its debugging port')
        page = next(t for t in targets if t.get('type') == 'page')

        def attach(ws):
            cdp = sh.CDP(ws); cdp.call('Page.enable'); cdp.call('Runtime.enable'); return cdp
        def ev(cdp, expr):
            r = cdp.call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True})
            if 'exceptionDetails' in r: raise RuntimeError(str(r['exceptionDetails'].get('exception', {}).get('description', r['exceptionDetails'])))
            return r.get('result', {}).get('value')
        def until(cdp, expr, seconds=20, what=''):
            end = time.time() + seconds
            while time.time() < end:
                if ev(cdp, expr): return True
                time.sleep(0.2)
            raise RuntimeError('timed out waiting for ' + (what or expr))
        def shoot(cdp, name):
            time.sleep(0.6)   # the last draw
            res = cdp.call('Page.captureScreenshot', {'format': 'png'})
            png = os.path.join(tmp, name + '.png')
            with open(png, 'wb') as f: f.write(base64.b64decode(res['data']))
            w, h = SIZES[name]
            out = os.path.join(OUT, name + '.jpg')
            subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '88', '-z', str(h), str(w), png, '--out', out], check=True, stdout=subprocess.DEVNULL)
            print('wrote', os.path.relpath(out, ROOT), f'{w} × {h}')

        # ---- the base, 1280 × 800 at 2×, light, the labels of Show me around off, the clock local
        base = attach(page['webSocketDebuggerUrl'])
        base.call('Emulation.setDeviceMetricsOverride', {'width': 1280, 'height': 800, 'deviceScaleFactor': 2, 'mobile': False})
        base.call('Page.navigate', {'url': url + '/?mock'})
        base.wait_event('Page.loadEventFired')
        until(base, "!document.getElementById('app').hidden && document.querySelectorAll('#zones .zr').length === 6", 30, 'the seeded incident')
        ev(base, "localStorage.setItem('ic.base.around', '1'); localStorage.setItem('ic.theme', 'light'); localStorage.setItem('ic.base.clock', 'local'); document.documentElement.dataset.theme = 'light'; if (document.querySelector('#around .around-all')) document.querySelector('#around .around-all').click(); if (/UTC$/.test(document.getElementById('clock').textContent)) document.getElementById('clock').click(); true")
        until(base, "(() => { const t = [...document.querySelectorAll('#map .leaflet-tile')]; return t.length > 8 && t.every((x) => x.classList.contains('leaflet-tile-loaded')); })()", 40, 'the map tiles')
        until(base, "document.getElementById('toast').hidden", 10, 'the labels\' toast to pass')
        esc = lambda: (ev(base, "document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); true"), time.sleep(0.3))
        if 'base-map' in wanted:
            ev(base, "document.getElementById('inc-sub').click(); true")
            until(base, "!document.getElementById('inc-pop').hidden && document.querySelectorAll('#inc-pop .ic-tile').length === 4", 10, 'the incident card')
            shoot(base, 'base-map')
            esc()
        if 'base-codes' in wanted:
            ev(base, "document.getElementById('inc-code').click(); true")
            until(base, "!document.getElementById('codes-pop').hidden && !!document.querySelector('#codes-pop .qr-box svg')", 10, "the codes' card")
            shoot(base, 'base-codes')
            esc()
        if 'base-iap' in wanted:
            ev(base, "document.querySelector('.top-btns [data-action=\"iap\"]').click(); true")
            until(base, "!document.getElementById('briefing').hidden && [...document.querySelectorAll('#briefing-page h2')].some((h) => /204/.test(h.textContent) && /A-1/.test(h.textContent))", 15, "the IAP with A-1's 204")
            until(base, "!!document.querySelector('#briefing-page .has-map svg, #briefing-page .has-map img, #briefing-page figure')", 15, 'the printed map')
            ev(base, "(() => { const h = [...document.querySelectorAll('#briefing-page h2')].find((x) => /204/.test(x.textContent) && /A-1/.test(x.textContent)); h.scrollIntoView({ block: 'start' }); return true; })()")
            shoot(base, 'base-iap')
            ev(base, "document.querySelector('[data-action=\"close-briefing\"]').click(); true")
            until(base, "document.getElementById('briefing').hidden", 10, 'the IAP closed')

        # ---- the phone, 375 × 812 at 2×, opened after the base so it adopts the base tab's mock
        if 'phone-home' in wanted or 'phone-par' in wanted:
            req = urllib.request.Request(f'http://127.0.0.1:{port}/json/new?about:blank', method='PUT')
            tab = json.load(urllib.request.urlopen(req, timeout=5))
            phone = attach(tab['webSocketDebuggerUrl'])
            phone.call('Emulation.setDeviceMetricsOverride', {'width': 375, 'height': 812, 'deviceScaleFactor': 2, 'mobile': True})
            phone.call('Page.navigate', {'url': url + '/field/?mock'})
            phone.wait_event('Page.loadEventFired')
            until(phone, "document.querySelector('#s-home') && document.body.textContent.includes('Unit 3')", 30, 'the phone signed in as Unit 3')
            ev(phone, "localStorage.setItem('ic.theme', 'light'); document.documentElement.dataset.theme = 'light'; true")
            # the briefing shows once per check-in: read it and go home
            time.sleep(1.5)
            ev(phone, "(() => { const b = document.querySelector('#s-briefing'); if (b && !b.hidden) { const ok = b.querySelector('[data-action=\"briefed\"]') || b.querySelector('.btn.pri') || b.querySelector('.btn'); if (ok) ok.click(); } return true; })()")
            until(phone, "document.getElementById('s-briefing').hidden && [...document.querySelectorAll('.sheet')].every((s) => s.hidden)", 10, 'the home screen')
            time.sleep(3.2)   # the Briefed toast goes
            if 'phone-home' in wanted: shoot(phone, 'phone-home')
            if 'phone-par' in wanted:
                # a head count to everyone, started from the base tab
                ev(base, "document.querySelector('#panel [data-action=\"start-par\"][data-target=\"all\"]').click(); true")
                time.sleep(0.5)
                ev(base, "(() => { const d = document.getElementById('confirm-dialog'); if (d && d.open) document.getElementById('confirm-ok').click(); return true; })()")
                until(base, "!document.getElementById('safety').hidden", 15, 'the PAR on the alarm line')
                until(phone, "!document.getElementById('s-safety').hidden && document.querySelectorAll('#safety-list .btn').length >= 2", 20, 'the PAR on the phone')
                shoot(phone, 'phone-par')
    finally:
        chrome.terminate()
        try: chrome.wait(5)
        except Exception: chrome.kill()
        shutil.rmtree(profile, ignore_errors=True)
        shutil.rmtree(tmp, ignore_errors=True)

if __name__ == '__main__':
    main()
