# Jelly Brain art layers (dev tool): from Tom's concept art, make the static base the app draws on.
#  - the brain's insides and the tentacles are taken out (the app draws them live as VDOT dots)
#  - small stars / sparkles are lifted into sprites so they can twinkle and drift; their spots are healed
import sys, json, numpy as np, cv2
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
im = cv2.imread(src)                      # BGR
H, W = im.shape[:2]
hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
lum = cv2.cvtColor(im, cv2.COLOR_BGR2GRAY).astype(np.float32)
# ---- dome interior (a soft superellipse inside the glass rim)
cx, cy, ax, top, bot = 1262, 300, 300, 232, 190
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
b = np.where(yy < cy, top, bot)
d = (np.abs(xx - cx) / ax) ** 2.4 + (np.abs(yy - cy) / b) ** 2.4
dome = d < 1.06
# ---- tentacles below the dome: bright pixels in that box, healed away
box = np.zeros((H, W), np.uint8); box[524:655, 1030:1460] = 1
bg = cv2.GaussianBlur(lum, (0, 0), 25)
# the whole skirt under the dome is replaced (a smooth half-ellipse), not just the tentacle pixels
# the face: Tom's own eyes and mouth are lifted into sprites (so they can blink and smile); the brain stays painted
FACE = {'eyeL': (1112, 300, 1172, 370), 'wink': (1262, 326, 1348, 378), 'mouth': (1128, 374, 1318, 440)}
g_, r_ = im[..., 1].astype(np.int32), im[..., 2].astype(np.int32)
tent = np.zeros((H, W), np.uint8)
for (x0, y0, x1, y1) in FACE.values():
    sub = ((g_[y0:y1, x0:x1] > 150) & (g_[y0:y1, x0:x1] > r_[y0:y1, x0:x1] + 25)).astype(np.uint8)
    tent[y0:y1, x0:x1] = cv2.dilate(sub, np.ones((11, 11), np.uint8))
# ---- stars: small bright saturated blobs on the dark sky, away from the big shapes
keep = np.zeros((H, W), np.uint8)
keep[640:1735, 165:1630] = 1          # the screen window
keep[0:640, 80:1640] = 1              # the logo + brain area (stars near it handled by the list below)
keep[1740:2330, 360:1450] = 1         # the controller
sat = (hsv[..., 2] > 150) & (lum - bg > 40)
n, lab, st, cen = cv2.connectedComponentsWithStats(sat.astype(np.uint8), 8)
stars = []
smask = np.zeros((H, W), np.uint8)
for i in range(1, n):
    x, y, w, h, a = st[i]
    if a < 25 or a > 2600 or w > 70 or h > 70 or w < 5 or h < 5: continue
    if keep[y + h // 2, x + w // 2] and not (y < 640 and (x > 1600 or x < 120)): continue
    # skip pieces of the slime frame (long thin or touching big bright neighbours)
    roi = sat[max(0, y - 6):y + h + 6, max(0, x - 6):x + w + 6]
    if roi.sum() > a * 1.6: continue
    pad = 10; x0, y0, x1, y1 = max(0, x - pad), max(0, y - pad), min(W, x + w + pad), min(H, y + h + pad)
    stars.append({'x': int(x0), 'y': int(y0), 'w': int(x1 - x0), 'h': int(y1 - y0)})
    smask[y0:y1, x0:x1] = np.maximum(smask[y0:y1, x0:x1], cv2.dilate((lab[y0:y1, x0:x1] == i).astype(np.uint8), np.ones((15, 15), np.uint8)))
# sprites: the star with its glow, alpha from how much brighter it is than the healed sky
# healing: the sky behind, estimated only from dark sky pixels (normalized convolution), so no glow bleeds in
holes = ((smask > 0) | (tent > 0))
bgm = cv2.medianBlur(lum.astype(np.uint8), 31).astype(np.float32)
dark = ((lum < bgm + 6) & ~cv2.dilate(holes.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)).astype(np.float32)
def sky(r):
    num = cv2.GaussianBlur(im.astype(np.float32) * dark[..., None], (0, 0), r)
    den = cv2.GaussianBlur(dark, (0, 0), r)[..., None]
    return num / np.maximum(den, 1e-4)
sk = 0.5 * sky(14) + 0.5 * sky(28)
rng = np.random.default_rng(7); sk += rng.normal(0, 2.0, sk.shape)   # a little grain so it matches the painting
feather = np.maximum(cv2.GaussianBlur(holes.astype(np.float32), (0, 0), 3) * 1.6, cv2.GaussianBlur(tent.astype(np.float32), (0, 0), 16) * 1.3)
feather = np.clip(feather, 0, 1)[..., None]
heal = (im.astype(np.float32) * (1 - feather) + sk * feather)
# the skirt: each row is filled by blending the sky just left and right of it (keeps the glow fading downward)
sm = cv2.GaussianBlur(im.astype(np.float32), (0, 0), 4)
rows = []
fill = heal.copy()
for y in rows:
    xs = np.where(tent[y])[0]; x0, x1 = max(0, xs[0] - 10), min(W - 1, xs[-1] + 10)
    cl, cr = sm[y, x0], sm[y, x1]
    u = ((np.arange(x0, x1 + 1) - x0) / max(1, x1 - x0))[:, None]
    fill[y, x0:x1 + 1] = cl * (1 - u) + cr * u
fill = cv2.GaussianBlur(fill, (0, 0), 6)
fill += rng.normal(0, 2.0, fill.shape)
face_heal = cv2.inpaint(im, cv2.dilate(tent, np.ones((5, 5), np.uint8)) * 255, 7, cv2.INPAINT_TELEA).astype(np.float32)
face_heal = cv2.GaussianBlur(face_heal, (0, 0), 1.2)
tf = np.clip(cv2.GaussianBlur(tent.astype(np.float32), (0, 0), 3) * 1.6, 0, 1)[..., None]
heal = heal * (1 - tf) + face_heal * tf
faces = {}
for k, (x0, y0, x1, y1) in FACE.items():
    a = np.clip((im[y0:y1, x0:x1].astype(np.float32) - heal[y0:y1, x0:x1]).max(axis=2) * 1.6, 0, 255)
    spr = np.dstack([im[y0:y1, x0:x1][..., ::-1], a.astype(np.uint8)])
    Image.fromarray(spr, 'RGBA').save(out + '/face_' + k + '.png'); faces[k] = [x0, y0, x1 - x0, y1 - y0]
atlas_w = 64 * 8; rows = (len(stars) + 7) // 8
atlas = np.zeros((max(1, rows) * 96, atlas_w, 4), np.uint8)
for k, s in enumerate(stars):
    x, y, w, h = s['x'], s['y'], s['w'], s['h']
    a = (im[y:y + h, x:x + w].astype(np.float32) - heal[y:y + h, x:x + w]).max(axis=2)
    a = np.clip(a * 1.4, 0, 255)
    ax0, ay0 = (k % 8) * 64, (k // 8) * 96
    w2, h2 = min(w, 64), min(h, 96)
    rgb = im[y:y + h2, x:x + w2][..., ::-1]
    atlas[ay0:ay0 + h2, ax0:ax0 + w2, :3] = rgb
    atlas[ay0:ay0 + h2, ax0:ax0 + w2, 3] = a[:h2, :w2].astype(np.uint8)
    s.update({'ax': ax0, 'ay': ay0, 'w': w2, 'h': h2})
# ---- bake the empty glass: deep violet, lighter at the top, a soft inner shadow at the rim, one highlight
base = heal.astype(np.float32)
t = np.clip((yy - (cy - top)) / (top + bot), 0, 1)
glass = np.stack([60 + 30 * (1 - t), 18 + 10 * (1 - t), 46 + 26 * (1 - t)], -1)   # BGR
mix = np.clip((1.05 - d) / 0.1, 0, 1)[..., None]   # solid glass inside, blending into the rim
ring = np.exp(-((d - 0.9) / 0.05) ** 2) * (d < 1.0)
glass = glass + ring[..., None] * np.array([70, 60, 40])   # a soft inner glow just inside the rim
pass  # (v0.7: the painted brain stays)
hl = np.exp(-(((xx - 1105) / 70) ** 2 + ((yy - 130) / 26) ** 2)) * 150

cv2.imwrite(out + '/base.jpg', np.clip(base, 0, 255).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 93])
Image.fromarray(atlas, 'RGBA').save(out + '/stars.png')
json.dump({'w': W, 'h': H, 'stars': stars, 'dome': {'cx': cx, 'cy': cy, 'ax': ax, 'top': top, 'bot': bot},
           'screen': [176, 648, 1616, 1728], 'face': faces}, open(out + '/layers.json', 'w'))
print('stars', len(stars), 'tentacle px', int(tent.sum()))
# the app reads the layer list as a script (no file fetches needed)
import os
d = json.load(open(out + '/layers.json')); open(out + '/layers.js', 'w').write('window.JB_LAYERS = ' + json.dumps(d) + ';\n'); os.remove(out + '/layers.json')
