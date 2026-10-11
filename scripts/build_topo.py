"""Generates public/topo.svg: a seamless-looking topographic contour pattern used as a decorative backdrop.

The SVG draws thin black strokes; the app tints it through CSS `mask-image`, so one file serves both themes.
Usage: python3 scripts/build_topo.py
"""
import os

import numpy as np
from skimage import measure

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W = H = 900
rng = np.random.default_rng(11)

# Smooth random field: a sum of a few Gaussian bumps of varying width.
yy, xx = np.mgrid[0:H:3, 0:W:3].astype(float)
field = np.zeros_like(xx)
for _ in range(26):
    cx, cy = rng.uniform(-100, W + 100), rng.uniform(-100, H + 100)
    s = rng.uniform(70, 210)
    a = rng.uniform(-1, 1.4)
    field += a * np.exp(-(((xx - cx) ** 2) + ((yy - cy) ** 2)) / (2 * s * s))

paths = []
for level in np.linspace(field.min() + 0.05, field.max() - 0.05, 16):
    for c in measure.find_contours(field, level):
        if len(c) < 12:
            continue
        pts = c[::2] * 3
        d = 'M' + ' L'.join(f'{p[1]:.1f} {p[0]:.1f}' for p in pts)
        paths.append(f'<path d="{d}"/>')

svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMid slice">'
       f'<g fill="none" stroke="#000" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round">'
       + ''.join(paths) + '</g></svg>')
with open(os.path.join(APP, 'public', 'topo.svg'), 'w') as f:
    f.write(svg)
print('topo.svg', len(svg), 'bytes,', len(paths), 'paths')
