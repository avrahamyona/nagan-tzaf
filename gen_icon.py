#!/usr/bin/env python3
"""Apple Music-style icon: red rounded square with a white note. Supersampled."""
from PIL import Image, ImageDraw

S = 2048
SS = 4
W = S * SS

img = Image.new('RGBA', (W, W), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# rounded square (squircle-ish), iOS icon radius ~22.37%
rad = int(W * 0.2237)
# vertical gradient: #fc5c72 (top) -> #fa233b (bottom) like Apple Music
top = (252, 92, 114)
bot = (250, 35, 59)
for y in range(W):
    t = y / W
    c = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)) + (255,)
    d.line([(0, y), (W, y)], fill=c)

# mask to rounded square
mask = Image.new('L', (W, W), 0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle([0, 0, W - 1, W - 1], radius=rad, fill=255)
img.putalpha(mask)

# white note: two connected eighth notes (Apple Music glyph style)
note = Image.new('RGBA', (W, W), (0, 0, 0, 0))
nd = ImageDraw.Draw(note)
w = (255, 255, 255, 255)
# geometry in icon units (0..1 of icon)
def X(f): return int(f * W)
# beam (thick diagonal bar on top)
nd.polygon([(X(0.335), X(0.295)), (X(0.685), X(0.235)), (X(0.685), X(0.335)), (X(0.335), X(0.395))], fill=w)
# stems
nd.rectangle([X(0.335), X(0.30), X(0.385), X(0.615)], fill=w)   # left stem
nd.rectangle([X(0.635), X(0.24), X(0.685), X(0.555)], fill=w)   # right stem
# note heads (ellipses)
nd.ellipse([X(0.20), X(0.535), X(0.385), X(0.66)], fill=w)
nd.ellipse([X(0.50), X(0.475), X(0.685), X(0.60)], fill=w)

# rotate the note slightly like the real glyph (-8 deg)
note = note.rotate(6, resample=Image.BICUBIC, center=(W // 2, W // 2))
img.alpha_composite(note)

img = img.resize((S, S), Image.LANCZOS)
for size, name in [(512, 'icon-512.png'), (192, 'icon-192.png'), (180, 'icon-180.png')]:
    img.resize((size, size), Image.LANCZOS).save(name)
print('icons written')
