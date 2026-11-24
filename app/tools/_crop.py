import sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
x0, y0, x1, y1, k = [int(v) for v in sys.argv[3:8]]
im = Image.open(src).convert("RGB")
c = im.crop((x0, y0, x1, y1))
c = c.resize((c.width * k, c.height * k), Image.LANCZOS)
c.save(dst)
print(c.size)
