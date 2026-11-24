# -*- coding: utf-8 -*-
"""第三轮：兽影/斧劈/暗爪改为有方向感的横向素材，按原比例缩放到 512x384。"""
import io
import os
import urllib.request

from PIL import Image

URLS = {
    "beast": "https://aka.doubaocdn.com/s/rw6eOI4PA4",
    "axe": "https://aka.doubaocdn.com/s/e5FhJaPZIX",
    "shadow": "https://aka.doubaocdn.com/s/ZLHTPkGsUz",
}
OUT = "/mnt/g/桌面/个人文件/项目/三国将星录/正式版/web/fx/"
ORIG = "/mnt/g/桌面/个人文件/项目/三国将星录/美术素材/技能特效/原图/"

for k, u in URLS.items():
    raw = urllib.request.urlopen(u, timeout=90).read()
    im = Image.open(io.BytesIO(raw)).convert("RGBA")
    w, h = im.size
    im.save(ORIG + "fx_%s_原图.png" % k)
    im.resize((512, 384), Image.LANCZOS).save(OUT + "fx_%s.png" % k)
    alpha = im.resize((512, 384), Image.LANCZOS).getchannel("A")
    ratio = sum(1 for p in alpha.getdata() if p < 12) / float(512 * 384)
    print(k, "%dx%d" % (w, h), "->512x384", "trans %.1f%%" % (ratio * 100), os.path.getsize(OUT + "fx_%s.png" % k))
