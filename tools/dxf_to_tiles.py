#!/usr/bin/env python
"""DXF -> 래스터 타일 피라미드 (딥줌). ezdxf로 고해상 마스터 렌더 → PIL로 레벨별 타일 슬라이스.

브라우저 뷰어는 '현재 줌레벨의 보이는 타일'만 로드 → 오버뷰 즉시, 확대 시 그 영역 고해상 타일만.

사용:  python tools/dxf_to_tiles.py "drawings/xxx.dxf" public/tiles [MASTER_PX]
출력:  public/tiles/{z}/{x}_{y}.png  +  public/tiles/manifest.json
"""
import sys, os, json, math, time
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import ezdxf
from ezdxf.addons.drawing import RenderContext, Frontend
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
from ezdxf.bbox import extents
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
TILE = 1024


def render_master(src, master_px):
    doc = ezdxf.readfile(src)
    msp = doc.modelspace()
    b = extents([e for e in msp if e.dxftype() != "IMAGE"], fast=True)
    W = master_px
    H = int(W * (b.extmax[1] - b.extmin[1]) / (b.extmax[0] - b.extmin[0]))
    dpi = 200
    fig = plt.figure(figsize=(W / dpi, H / dpi), dpi=dpi)
    ax = fig.add_axes([0, 0, 1, 1]); ax.set_axis_off()
    Frontend(RenderContext(doc), MatplotlibBackend(ax)).draw_layout(
        msp, finalize=False, filter_func=lambda e: e.dxftype() != "IMAGE")
    ax.set_xlim(b.extmin[0], b.extmax[0]); ax.set_ylim(b.extmin[1], b.extmax[1]); ax.set_aspect("equal")
    tmp = "_master.png"
    fig.savefig(tmp, dpi=dpi, transparent=True); plt.close(fig)
    return tmp, b, W, H


def slice_pyramid(master_path, outdir, b, mw, mh):
    master = Image.open(master_path).convert("RGBA")
    # 레벨 목록: 전체(마스터)에서 절반씩 축소, TILE 이하가 될 때까지. z=0=가장 저해상.
    imgs = [master]
    while imgs[-1].width > TILE or imgs[-1].height > TILE:
        im = imgs[-1]
        imgs.append(im.resize((max(1, im.width // 2), max(1, im.height // 2)), Image.LANCZOS))
    imgs = list(reversed(imgs))
    levels = []
    for z, im in enumerate(imgs):
        cols = math.ceil(im.width / TILE); rows = math.ceil(im.height / TILE)
        zdir = os.path.join(outdir, str(z)); os.makedirs(zdir, exist_ok=True)
        for x in range(cols):
            for y in range(rows):
                box = (x * TILE, y * TILE, min((x + 1) * TILE, im.width), min((y + 1) * TILE, im.height))
                im.crop(box).save(os.path.join(zdir, f"{x}_{y}.png"))
        levels.append({"z": z, "pxW": im.width, "pxH": im.height, "cols": cols, "rows": rows})
        print(f"  L{z}: {im.width}x{im.height}  {cols}x{rows} tiles")
    manifest = {
        "tile": TILE,
        "levels": levels,
        "masterPx": [mw, mh],
        "worldMin": [round(b.extmin[0], 1), round(b.extmin[1], 1)],
        "worldMax": [round(b.extmax[0], 1), round(b.extmax[1], 1)],
        "units": "mm",
    }
    with open(os.path.join(outdir, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f)
    print("wrote manifest.json")


def main(src, outdir, master_px=16000):
    os.makedirs(outdir, exist_ok=True)
    t = time.time()
    tmp, b, mw, mh = render_master(src, master_px)
    print(f"master {mw}x{mh} rendered in {time.time()-t:.0f}s → slicing…")
    slice_pyramid(tmp, outdir, b, mw, mh)
    os.remove(tmp)
    print(f"done in {time.time()-t:.0f}s")


if __name__ == "__main__":
    src = sys.argv[1]
    outdir = sys.argv[2] if len(sys.argv) > 2 else "public/tiles"
    mpx = int(sys.argv[3]) if len(sys.argv) > 3 else 16000
    main(src, outdir, mpx)
