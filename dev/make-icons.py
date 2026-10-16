#!/usr/bin/env python3
# Draws the app icons without any image library: a deep blue tile with a white compass ring and
# a needle pointing north. Writes icons/icon-192.png, icon-512.png, icon-maskable-512.png and
# apple-touch-icon.png (180). Rendered at twice the size and averaged down for smooth edges.
#   python3 dev/make-icons.py
import os, struct, zlib

BG = (31, 78, 121)
WHITE = (255, 255, 255)
RED = (217, 130, 43)

def png(w, h, rows):
    raw = b''.join(b'\x00' + bytes(r) for r in rows)
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')

def inside_tri(px, py, a, b, c):
    def s(p, q, r): return (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1])
    d1, d2, d3 = s((px, py), a, b), s((px, py), b, c), s((px, py), c, a)
    return not ((d1 < 0 or d2 < 0 or d3 < 0) and (d1 > 0 or d2 > 0 or d3 > 0))

def render(size, maskable):
    # draw at 2x
    S = size * 2
    cx = cy = S / 2
    radius = S * 0.5 if maskable else S * 0.22      # corner radius of the tile
    ring_r, ring_w = S * 0.33, S * 0.045
    pad = S * 0.1 if maskable else 0
    scale = (S - 2 * pad) / S
    def shape(x, y):
        # tile with rounded corners (maskable: full bleed, the platform masks it)
        if not maskable:
            rx, ry = abs(x - cx) - (cx - radius), abs(y - cy) - (cy - radius)
            if rx > 0 and ry > 0 and rx * rx + ry * ry > radius * radius: return None
        # geometry centred and scaled for the safe zone
        ux, uy = (x - cx) / scale, (y - cy) / scale
        d = (ux * ux + uy * uy) ** 0.5
        if abs(d - ring_r) < ring_w / 2: return WHITE
        north = inside_tri(ux, uy, (0, -ring_r * 0.78), (-ring_r * 0.26, 0), (ring_r * 0.26, 0))
        south = inside_tri(ux, uy, (0, ring_r * 0.78), (-ring_r * 0.26, 0), (ring_r * 0.26, 0))
        if north: return RED
        if south: return WHITE
        if d < ring_r * 0.09: return BG
        return BG
    big = [[shape(x + 0.5, y + 0.5) for x in range(S)] for y in range(S)]
    rows = []
    for y in range(size):
        row = []
        for x in range(size):
            px = [big[2 * y][2 * x], big[2 * y][2 * x + 1], big[2 * y + 1][2 * x], big[2 * y + 1][2 * x + 1]]
            solid = [p for p in px if p is not None]
            if not solid: row += [0, 0, 0, 0]; continue
            a = int(255 * len(solid) / 4)
            r = sum(p[0] for p in solid) // len(solid); g = sum(p[1] for p in solid) // len(solid); b = sum(p[2] for p in solid) // len(solid)
            row += [r, g, b, a]
        rows.append(row)
    return png(size, size, rows)

out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'icons')
os.makedirs(out, exist_ok=True)
for name, size, maskable in (('icon-192.png', 192, False), ('icon-512.png', 512, False), ('icon-maskable-512.png', 512, True), ('apple-touch-icon.png', 180, True)):
    with open(os.path.join(out, name), 'wb') as f: f.write(render(size, maskable))
    print('wrote', name)
