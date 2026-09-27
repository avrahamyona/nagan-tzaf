from PIL import Image, ImageDraw, ImageFilter
import numpy as np

S = 2048
img = Image.new('RGBA', (S, S), (0,0,0,0))

c1 = (124,58,237); c2 = (236,72,153)
xx, yy = np.meshgrid(np.linspace(0,1,S), np.linspace(0,1,S))
t = (xx+yy)/2
arr = np.zeros((S,S,3), np.uint8)
for i in range(3):
    arr[:,:,i] = (c1[i] + (c2[i]-c1[i])*t).astype(np.uint8)
grad = Image.fromarray(arr,'RGB').convert('RGBA')
mask = Image.new('L',(S,S),0)
md = ImageDraw.Draw(mask)
md.rounded_rectangle([int(S*.05),int(S*.05),int(S*.95),int(S*.95)], radius=int(S*.24), fill=255)
img.paste(grad,(0,0),mask)

# highlight
hl = Image.new('RGBA',(S,S),(0,0,0,0))
hd = ImageDraw.Draw(hl)
hd.ellipse([-S*.3,-S*.45,S*.75,S*.4], fill=(255,255,255,26))
hl = hl.filter(ImageFilter.GaussianBlur(int(S*.08)))
img.alpha_composite(Image.composite(hl, Image.new('RGBA',(S,S),(0,0,0,0)), mask))

# shadow under floating note
sh = Image.new('RGBA',(S,S),(0,0,0,0))
sd = ImageDraw.Draw(sh)
sd.ellipse([int(S*.34),int(S*.79),int(S*.66),int(S*.85)], fill=(60,10,80,95))
sh = sh.filter(ImageFilter.GaussianBlur(int(S*.02)))
img.alpha_composite(sh)

# ---- beamed eighth notes, drawn manually, then tilted ----
note = Image.new('RGBA',(S,S),(0,0,0,0))
nd = ImageDraw.Draw(note)
W = (255,255,255,255)
sw = int(S*.030)          # stem width
bh = int(S*.085)          # beam thickness
# geometry
lx = S*0.335   # left head center x
rx = S*0.615   # right head center x
ly = S*0.575   # left head center y
ry = S*0.545   # right head center y (a bit higher = playful lilt)
lty = S*0.205  # left stem top y
rty = S*0.155  # right stem top y
lstem_x = lx + S*0.078
rstem_x = rx + S*0.078

def head(cx, cy, layer_img):
    e = Image.new('RGBA',(S,S),(0,0,0,0))
    ed = ImageDraw.Draw(e)
    ed.ellipse([cx-S*0.095, cy-S*0.075, cx+S*0.095, cy+S*0.075], fill=W)
    e = e.rotate(-14, resample=Image.BICUBIC, center=(cx,cy))
    layer_img.alpha_composite(e)

head(lx, ly, note)
head(rx, ry, note)
nd = ImageDraw.Draw(note)
# stems (rounded)
nd.rounded_rectangle([lstem_x, lty, lstem_x+sw, ly+S*0.01], radius=sw//2, fill=W)
nd.rounded_rectangle([rstem_x, rty, rstem_x+sw, ry+S*0.01], radius=sw//2, fill=W)
# beam connecting stem tops
nd.polygon([(lstem_x, lty), (rstem_x+sw, rty), (rstem_x+sw, rty+bh), (lstem_x, lty+bh)], fill=W)
# tilt whole note
note = note.rotate(7, resample=Image.BICUBIC, center=(S*0.5, S*0.42))
img.alpha_composite(note)

# ripples
for cx,cy,rrx,rry,wd,alpha in [
    (S*.50, S*.845, S*.15, S*.042, int(S*.026), 255),
    (S*.50, S*.845, S*.24, S*.070, int(S*.019), 165),
    (S*.50, S*.845, S*.33, S*.098, int(S*.013), 95),
]:
    arc = Image.new('RGBA',(S,S),(0,0,0,0))
    ad = ImageDraw.Draw(arc)
    ad.arc([cx-rrx, cy-rry, cx+rrx, cy+rry], start=18, end=162, fill=(255,255,255,alpha), width=wd)
    img.alpha_composite(arc)

img.resize((512,512), Image.LANCZOS).save('/downloads/nagan-logo2.png')
img.resize((192,192), Image.LANCZOS).save('icon-192.png')
img.resize((512,512), Image.LANCZOS).save('icon-512.png')
img.resize((180,180), Image.LANCZOS).save('icon-180.png')
print('done')
