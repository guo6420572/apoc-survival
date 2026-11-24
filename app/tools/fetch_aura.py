# -*- coding: utf-8 -*-
"""下载新版 aura（气场气浪）贴图 -> 居中裁方 -> 512 -> 覆盖 web/fx/fx_aura.png"""
import os
import urllib.request

from PIL import Image

URL = "https://aka.doubaocdn.com/s/R03mlQujJU"
ROOT = "/mnt/g/桌面/个人文件/项目/三国将星录"
RAW = os.path.join(ROOT, "美术素材/技能特效/原图/fx_aura_v2.png")
DST = os.path.join(ROOT, "正式版/web/fx/fx_aura.png")
TMP = "/tmp/aura_v2_raw.png"

req = urllib.request.Request(URL, headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(req, timeout=60) as r, open(TMP, "wb") as f:
    f.write(r.read())
print("downloaded", os.path.getsize(TMP))

im = Image.open(TMP).convert("RGBA")
w, h = im.size
side = min(w, h)
im = im.crop(((w - side) // 2, (h - side) // 2, (w - side) // 2 + side, (h - side) // 2 + side))
im = im.resize((512, 512), Image.LANCZOS)
im.save(RAW)
im.save(DST, optimize=True)
print("raw", im.size, os.path.getsize(RAW), "->", DST, os.path.getsize(DST))
