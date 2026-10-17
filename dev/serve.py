#!/usr/bin/env python3
"""The local dev server: python's http.server with caching turned off, so an edited file is what the
browser gets on the next load (the stock server's Last-Modified lets the browser reuse a stale copy
for minutes). Run: python3 dev/serve.py [port], default 8766, on 127.0.0.1 only."""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, *args):   # quiet
        pass


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
