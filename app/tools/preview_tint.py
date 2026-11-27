# -*- coding: utf-8 -*-
"""离线预览：把同一张刀气贴图按四阵营色做 'color' 混合，横排对比。

引擎里用 canvas globalCompositeOperation='color' 做同一件事，
这里用 HLS 保亮度换色相/饱和来复现，用于快速看配色效果。
"""
import colorsys
import os

from PIL import Image

SRC = "/mnt/g/桌面/个人文件/项目/三国将星录/正式版/web/fx/fx_slash.png"
OUT = "/tmp/fx_tint_factions.png"

FACTIONS = [("#3A6CA8", "魏"), ("#B23A2E", "蜀"), ("#2E8A6A", "吴"), ("#7A4A9E", "群雄")]
TW, TH = 300, 240


def hex2rgb(h):
    return tuple(int(h[i:i + 2], 16) / 255.0 for i in (1, 3, 5))


def recolor(im, hexcol):
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    th_, ts_, tl_ = colorsys.rgb_to_hls(*hex2rgb(hexcol))
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 12:
                px[x, y] = (r, g, b, 0)
                continue
            hh, ll, ss = colorsys.rgb_to_hls(r / 255.0, g / 255.0, b / 255.0)
            r2, g2, b2 = colorsys.hls_to_rgb(th_, ll, max(0.2, min(1.0, ts_ * 1.05)))
            px[x, y] = (int(r2 * 255), int(g2 * 255), int(b2 * 255), a)
    return im


src = Image.open(SRC).convert("RGBA").resize((TW, TH), Image.LANCZOS)
sheet = Image.new("RGBA", (TW * 4 + 30, TH + 20), (26, 21, 18, 255))
for i, (col, name) in enumerate(FACTIONS):
    tile = Image.new("RGBA", (TW, TH), (26, 21, 18, 255))
    tint = recolor(src.copy(), col)
    # 模拟引擎：原图 + 30% 染色层叠加
    tile.alpha_composite(src, (0, 0))
    tint.putalpha(tint.getchannel("A").point(lambda v: int(v * 0.62)))
    tile.alpha_composite(tint, (0, 0))
    sheet.paste(tile, (i * (TW + 10), 10), tile)
    print(name, col, "ok")

sheet.convert("RGB").save(OUT, quality=92)
print("saved", OUT, os.path.getsize(OUT))
