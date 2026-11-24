# 下载 13 张技能特效素材 -> 校验透明 -> 缩放 512 -> 落到 web/fx/
import os, urllib.request
from PIL import Image

MAP = [
    ("slash",   "刀气", "https://aka.doubaocdn.com/s/LCRWTn4g3l"),
    ("spear",   "枪锋", "https://aka.doubaocdn.com/s/3Sq8adG4op"),
    ("axe",     "斧劈", "https://aka.doubaocdn.com/s/am1n8Txyf6"),
    ("bow",     "箭雨", "https://aka.doubaocdn.com/s/eV6I2l7skb"),
    ("ride",    "骑尘", "https://aka.doubaocdn.com/s/dg2Vr4fIap"),
    ("shield",  "光盾", "https://aka.doubaocdn.com/s/REtT5MpVRy"),
    ("heal",    "莲华", "https://aka.doubaocdn.com/s/YOUDVvMLD4"),
    ("fire",    "烈焰", "https://aka.doubaocdn.com/s/tDFBUkXCGr"),
    ("thunder", "雷罚", "https://aka.doubaocdn.com/s/02GjdCATUX"),
    ("poison",  "毒瘴", "https://aka.doubaocdn.com/s/vE5QNY5IaI"),
    ("shadow",  "暗爪", "https://aka.doubaocdn.com/s/QWb37A1fqh"),
    ("aura",    "法阵", "https://aka.doubaocdn.com/s/0hgYVQVy9K"),
    ("beast",   "兽影", "https://aka.doubaocdn.com/s/7LCWZT2TQc"),
]

ROOT = r"G:\桌面\个人文件\项目\三国将星录"
RAW = os.path.join(ROOT, "美术素材", "技能特效", "原图")
OUT = os.path.join(ROOT, "正式版", "web", "fx")
os.makedirs(RAW, exist_ok=True)
os.makedirs(OUT, exist_ok=True)

report = []
for form, cn, url in MAP:
    raw = os.path.join(RAW, f"fx_{form}_原图.png")
    if not os.path.exists(raw):
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=60) as r, open(raw, "wb") as f:
            f.write(r.read())
    im = Image.open(raw)
    im = im.convert("RGBA")
    a = im.getchannel("A")
    lo, hi = a.getextrema()
    transparent_ratio = sum(1 for v in a.getdata() if v < 8) / (im.width * im.height)
    im.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, f"fx_{form}.png"), optimize=True)
    size = os.path.getsize(os.path.join(OUT, f"fx_{form}.png"))
    # 裁出实际内容边界，便于引擎按留白比例定位
    bbox = im.getbbox()
    report.append((form, cn, im.size, lo, hi, round(transparent_ratio, 3), bbox, size))

for r in report:
    print(r)
print("total bytes", sum(os.path.getsize(os.path.join(OUT, f"fx_{f}.png")) for f, _, _ in MAP))
