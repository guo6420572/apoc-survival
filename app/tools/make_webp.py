#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把卡面 / 立绘批量转成 WebP（服务端按 Accept 协商，PNG 仍作兜底）。

用法：
    ~/opt/venv-learn/bin/python tools/make_webp.py            # 全量
    ~/opt/venv-learn/bin/python tools/make_webp.py --force    # 强制重转

输出：
    img/card/<编号_姓名>.webp
    img/portrait/<编号_姓名>_立绘.webp
    img/manifest.json
（img/ 为派生图，不进快照；重绘卡面后重跑本脚本即可）
"""
import argparse
import json
import os
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
ROOT = os.path.dirname(WEB)
CARD_SRC = os.path.join(ROOT, '美术素材', '卡面样张')
PORTRAIT_SRC = os.path.join(ROOT, '美术素材', '立绘原图')
CARD_OUT = os.path.join(WEB, 'img', 'card')
PORTRAIT_OUT = os.path.join(WEB, 'img', 'portrait')
MANIFEST = os.path.join(WEB, 'img', 'manifest.json')


def convert(args):
    src, dst, max_size, quality, force = args
    if not force and os.path.isfile(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
        return dst, os.path.getsize(dst), os.path.getsize(src), True
    im = Image.open(src).convert('RGB')
    im.thumbnail(max_size, Image.LANCZOS)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    im.save(dst, 'WEBP', quality=quality, method=4)
    return dst, os.path.getsize(dst), os.path.getsize(src), False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--force', action='store_true', help='忽略 mtime，全部重转')
    ap.add_argument('--quality', type=int, default=82)
    ap.add_argument('--workers', type=int, default=4)
    args = ap.parse_args()

    jobs = []
    for name in sorted(os.listdir(CARD_SRC)):
        if not name.lower().endswith('.png'):
            continue
        jobs.append((os.path.join(CARD_SRC, name),
                     os.path.join(CARD_OUT, name[:-4] + '.webp'),
                     (900, 1350), args.quality, args.force))
    for name in sorted(os.listdir(PORTRAIT_SRC)):
        if not name.lower().endswith('_立绘.png'):
            continue
        jobs.append((os.path.join(PORTRAIT_SRC, name),
                     os.path.join(PORTRAIT_OUT, name[:-4] + '.webp'),
                     (1000, 1500), args.quality, args.force))

    t0 = time.time()
    done = skipped = 0
    src_bytes = out_bytes = 0
    manifest = {'card': {}, 'portrait': {}}
    with ProcessPoolExecutor(max_workers=args.workers) as ex:
        futs = [ex.submit(convert, j) for j in jobs]
        for i, fut in enumerate(as_completed(futs), 1):
            dst, out_sz, src_sz, reused = fut.result()
            kind = 'card' if os.sep + 'card' + os.sep in dst else 'portrait'
            manifest[kind][os.path.basename(dst)] = {
                'bytes': out_sz, 'mtime': int(os.path.getmtime(dst)),
            }
            src_bytes += src_sz
            out_bytes += out_sz
            done += 1
            skipped += 1 if reused else 0
            if i % 40 == 0:
                print(f'  {i}/{len(jobs)}', flush=True)

    with open(MANIFEST, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
    dt = time.time() - t0
    print(f'完成 {done} 张（复用 {skipped}），{src_bytes / 1048576:.1f} MB -> '
          f'{out_bytes / 1048576:.1f} MB（-{(1 - out_bytes / max(1, src_bytes)) * 100:.1f}%），'
          f'{dt:.1f}s')
    print('清单：', MANIFEST)


if __name__ == '__main__':
    sys.exit(main())
