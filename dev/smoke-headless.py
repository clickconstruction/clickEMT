#!/usr/bin/env python3
"""The smoke suite (dev/smoke.js) in headless Chrome, for a machine with no browser window to keep visible: the suite
needs animation frames, which a hidden Browser pane never gets, and headless Chrome draws them. Talks to Chrome over
the DevTools protocol with a websocket client of its own, so nothing is installed. Needs `npm run serve` up and Google
Chrome in /Applications.

    python3 dev/smoke-headless.py                      the full run (slower than a window: allow a quarter of an hour)
    python3 dev/smoke-headless.py transports layers    one suite or a few, each a fresh page
    python3 dev/smoke-headless.py --log run.log        the console lines and the result to a file too
    python3 dev/smoke-headless.py --eval "<js>"        evaluate an expression on the page instead (await is allowed)

Prints every console line the page writes, then RESULT and the object run() resolves with ({ passed, total, failed,
results }). The handoff's rule stands: a suite that misses in a full run counts once it passes alone."""
import base64, json, os, shutil, socket, struct, subprocess, sys, tempfile, time, urllib.request

CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
PORT = 9333   # Chrome's debugging port; --port picks another so two runs can go at once

def ws_connect(url):
    hostport, path = url[5:].split('/', 1)
    host, port = hostport.split(':')
    s = socket.create_connection((host, int(port)))
    key = base64.b64encode(os.urandom(16)).decode()
    s.sendall((f'GET /{path} HTTP/1.1\r\nHost: {hostport}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
               f'Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n').encode())
    resp = b''
    while b'\r\n\r\n' not in resp:
        chunk = s.recv(4096)
        if not chunk: raise RuntimeError('websocket handshake failed')
        resp += chunk
    if b' 101 ' not in resp.split(b'\r\n')[0]: raise RuntimeError(resp.decode(errors='replace'))
    return s

def ws_frame(s, op, data):
    mask = os.urandom(4)
    head = bytearray([0x80 | op])
    n = len(data)
    if n < 126: head.append(0x80 | n)
    elif n < 65536: head.append(0x80 | 126); head += struct.pack('>H', n)
    else: head.append(0x80 | 127); head += struct.pack('>Q', n)
    head += mask
    s.sendall(bytes(head) + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

def recv_exact(s, n):
    buf = b''
    while len(buf) < n:
        chunk = s.recv(n - len(buf))
        if not chunk: raise RuntimeError('websocket closed')
        buf += chunk
    return buf

def ws_recv(s):
    msg = b''
    while True:
        b1, b2 = recv_exact(s, 2)
        fin, op, n = b1 & 0x80, b1 & 0x0f, b2 & 0x7f
        if n == 126: n = struct.unpack('>H', recv_exact(s, 2))[0]
        elif n == 127: n = struct.unpack('>Q', recv_exact(s, 8))[0]
        mask = recv_exact(s, 4) if b2 & 0x80 else None
        data = recv_exact(s, n)
        if mask: data = bytes(b ^ mask[i % 4] for i, b in enumerate(data))
        if op == 0x8: raise RuntimeError('websocket close')
        if op == 0x9: ws_frame(s, 0xA, data); continue
        if op == 0xA: continue
        msg += data
        if fin: return msg.decode()

class CDP:
    def __init__(self, url):
        self.s = ws_connect(url); self.s.settimeout(1200); self.n = 0; self.events = []
    def send(self, method, params=None):
        self.n += 1
        ws_frame(self.s, 0x1, json.dumps({'id': self.n, 'method': method, 'params': params or {}}).encode())
        return self.n
    def next(self):
        return json.loads(ws_recv(self.s))
    def call(self, method, params=None, on_event=None):
        mid = self.send(method, params)
        while True:
            m = self.next()
            if m.get('id') == mid:
                if 'error' in m: raise RuntimeError(m['error'])
                return m.get('result', {})
            if 'method' in m and on_event: on_event(m)
    def wait_event(self, name, on_event=None, timeout=60):
        t0 = time.time()
        while time.time() - t0 < timeout:
            m = self.next()
            if m.get('method') == name: return m
            if 'method' in m and on_event: on_event(m)
        raise RuntimeError('no ' + name)

def console_text(m):
    if m.get('method') != 'Runtime.consoleAPICalled': return None
    parts = []
    for a in m['params'].get('args', []):
        if 'value' in a: parts.append(str(a['value']))
        elif 'description' in a: parts.append(a['description'])
        else: parts.append(a.get('type', ''))
    return m['params'].get('type', 'log') + ': ' + ' '.join(parts)

def main():
    args = sys.argv[1:]
    url = 'http://localhost:8766/?mock'; log = None; suites = []; expr_only = None
    while args:
        a = args.pop(0)
        if a == '--url': url = args.pop(0)
        elif a == '--log': log = args.pop(0)
        elif a == '--eval': expr_only = args.pop(0)   # evaluate this instead of the suite (a promise is awaited; the value is printed as JSON)
        elif a == '--port': globals()['PORT'] = int(args.pop(0))
        else: suites.append(a)
    profile = tempfile.mkdtemp(prefix='clickemt-headless-')
    chrome = subprocess.Popen([CHROME, '--headless=new', f'--remote-debugging-port={PORT}', f'--user-data-dir={profile}',
                               '--window-size=1280,900', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
                               '--autoplay-policy=no-user-gesture-required', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    out = open(log, 'w') if log else None
    def say(line):
        print(line, flush=True)
        if out: out.write(line + '\n'); out.flush()
    try:
        for _ in range(100):
            try:
                targets = json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json', timeout=2)); break
            except Exception: time.sleep(0.2)
        else: raise RuntimeError('Chrome did not open its debugging port')
        page = next(t for t in targets if t.get('type') == 'page')
        cdp = CDP(page['webSocketDebuggerUrl'])
        cdp.call('Page.enable'); cdp.call('Runtime.enable')
        cdp.call('Emulation.setDeviceMetricsOverride', {'width': 1280, 'height': 900, 'deviceScaleFactor': 1, 'mobile': False})
        cdp.call('Page.navigate', {'url': url})
        cdp.wait_event('Page.loadEventFired')
        time.sleep(1.5)
        opts = json.dumps({'only': suites}) if suites else ''
        expr = f"import('/dev/smoke.js').then((m) => m.run({opts})).then((r) => JSON.stringify(r))" if expr_only is None else f"Promise.resolve().then(async () => ({expr_only})).then((v) => JSON.stringify(v))"
        def on_event(m):
            t = console_text(m)
            if t is not None: say(t)
            elif m.get('method') == 'Runtime.exceptionThrown':
                d = m['params']['exceptionDetails']; say('exception: ' + str(d.get('exception', {}).get('description', d.get('text'))))
        res = cdp.call('Runtime.evaluate', {'expression': expr, 'awaitPromise': True, 'returnByValue': True}, on_event)
        say('RESULT ' + str(res.get('result', {}).get('value', res)))
    finally:
        chrome.terminate()
        try: chrome.wait(5)
        except Exception: chrome.kill()
        shutil.rmtree(profile, ignore_errors=True)
        if out: out.close()

if __name__ == '__main__':
    main()
