# -*- coding: utf-8 -*-
"""下载第二轮（柱状/横向）国漫技能特效，居中裁方并缩放到 512 覆盖正式版资源。"""
import io
import os
import urllib.request

from PIL import Image

URLS = {
    "thunder": "https://aka.doubaocdn.com/s/Y1v1FhEEUv",
    "fire": "https://aka.doubaocdn.com/s/bHag7OoNce",
    "poison": "https://aka.doubaocdn.com/s/Va0CBagXLS",
    "heal": "https://aka.doubaocdn.com/s/EB5k4rwLNZ",
}
OUT = "/mnt/g/桌面/个人文件/项目/三国将星录/正式版/web/fx/"
ORIG = "/mnt/g/桌面/个人文件/项目/三国将星录/美术素材/技能特效/原图/"

os.makedirs(ORIG, exist_ok=True)
for k, u in URLS.items():
    raw = urllib.request.urlopen(u, timeout=90).read()
    im = Image.open(io.BytesIO(raw)).convert("RGBA")
    w, h = im.size
    im.save(ORIG + "fx_%s_原图.png" % k)
    s = min(w, h)
    box = ((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)
    sq = im.crop(box).resize((512, 512), Image.LANCZOS)
    out = OUT + "fx_%s.png" % k
    sq.save(out)
    alpha = sq.getchannel("A")
    lo, hi = alpha.getextrema()
    transparent_ratio = sum(1 for p in alpha.getdata() if p < 12) / float(512 * 512)
    print(k, "%dx%d" % (w, h), "->512", "alpha %d-%d" % (lo, hi), "trans %.1f%%" % (transparent_ratio * 100), os.path.getsize(out))
