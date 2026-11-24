# -*- coding: utf-8 -*-
"""从原图重建 thunder 贴图：裁方 512 + 轻度提亮（保留紫色层次，避免过曝成白柱）。"""
from PIL import Image

ORIG = "/mnt/g/桌面/个人文件/项目/三国将星录/美术素材/技能特效/原图/fx_thunder_原图.png"
OUT = "/mnt/g/桌面/个人文件/项目/三国将星录/正式版/web/fx/fx_thunder.png"
GAIN = 0.14

im = Image.open(ORIG).convert("RGBA")
w, h = im.size
s = min(w, h)
im = im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((512, 512), Image.LANCZOS)
r, g, b, a = im.split()
f = lambda v, gain=GAIN: int(255 - (255 - v) * (1 - gain))
im = Image.merge("RGBA", (r.point(f), g.point(f), b.point(f), a))
im.save(OUT)
print("thunder rebuilt, gain", GAIN, "size", im.size)
