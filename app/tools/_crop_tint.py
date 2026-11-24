import sys
from PIL import Image

src = sys.argv[1]
dst = sys.argv[2]
im = Image.open(src).convert("RGB")
c = im.crop((110, 105, 310, 235)).resize((600, 390), Image.LANCZOS)
c.save(dst)
print(c.size)
