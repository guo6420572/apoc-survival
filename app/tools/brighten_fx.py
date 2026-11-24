# -*- coding: utf-8 -*-
"""把特效贴图整体向白色提亮（模拟自发光的亮度），避免 lighter 叠加时显暗。"""
from PIL import Image

OUT = "/mnt/g/桌面/个人文件/项目/三国将星录/正式版/web/fx/"

# 提亮强度：0 = 原样，1 = 全白
GAIN = {"thunder": 0.42, "fire": 0.20, "poison": 0.34, "heal": 0.14}

for k, g in GAIN.items():
    p = OUT + "fx_%s.png" % k
    im = Image.open(p).convert("RGBA")
    r, gg, b, a = im.split()
    r2 = r.point(lambda v, g=g: int(255 - (255 - v) * (1 - g)))
    g2 = gg.point(lambda v, g=g: int(255 - (255 - v) * (1 - g)))
    b2 = b.point(lambda v, g=g: int(255 - (255 - v) * (1 - g)))
    im2 = Image.merge("RGBA", (r2, g2, b2, a))
    im2.save(p)
    print(k, "gain", g, "ok")
