#!/usr/bin/env python
"""DXF -> 타입 그룹별 투명 PNG 레이어 (ezdxf + matplotlib).

이 도면은 벽·가구가 한 레이어(ARCH)에 섞여 있어 '가구'는 분리 불가.
대신 엔티티 '타입'으로 분리 가능한 그룹(치수/문자/해치/장비)을 각각 투명 PNG로 구워
뷰어에서 체크박스로 on/off 한다. 모든 PNG는 동일 경계·픽셀크기로 렌더 → 스택 시 정확히 정렬.

사용:  python tools/dxf_layers_to_png.py "drawings/xxx.dxf" public [8000]
출력:  public/plan_base.png, plan_dim.png, plan_text.png, plan_hatch.png, plan_block.png
       + public/plan.json (경계/픽셀 메타)
"""
import sys, os, json
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import ezdxf
from ezdxf.addons.drawing import RenderContext, Frontend
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
from ezdxf.bbox import extents

GROUPS = {
    "base": {"LINE", "ARC", "SPLINE", "ELLIPSE", "LWPOLYLINE", "CIRCLE", "POINT"},
    "dim": {"DIMENSION"},
    "text": {"TEXT", "MTEXT", "ATTDEF"},
    "hatch": {"HATCH", "SOLID", "WIPEOUT"},
    "block": {"INSERT"},
}


def render(doc, msp, b, pxw, pxh, types, dst):
    dpi = 200
    fig = plt.figure(figsize=(pxw / dpi, pxh / dpi), dpi=dpi)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_axis_off()
    Frontend(RenderContext(doc), MatplotlibBackend(ax)).draw_layout(
        msp, finalize=False, filter_func=lambda e: e.dxftype() in types
    )
    ax.set_xlim(b.extmin[0], b.extmax[0])
    ax.set_ylim(b.extmin[1], b.extmax[1])
    ax.set_aspect("equal")
    fig.savefig(dst, dpi=dpi, transparent=True)
    plt.close(fig)
    print("  ->", dst)


def main(src, outdir, pxw=8000):
    doc = ezdxf.readfile(src)
    msp = doc.modelspace()
    b = extents([e for e in msp if e.dxftype() != "IMAGE"], fast=True)
    pxh = int(pxw * (b.extmax[1] - b.extmin[1]) / (b.extmax[0] - b.extmin[0]))
    for name, types in GROUPS.items():
        print(f"rendering {name} ({len(types)} types)…")
        render(doc, msp, b, pxw, pxh, types, os.path.join(outdir, f"plan_{name}.png"))
    meta = {
        "px": [pxw, pxh],
        "worldMin": [b.extmin[0], b.extmin[1]],
        "worldMax": [b.extmax[0], b.extmax[1]],
        "units": "mm",
        "layers": list(GROUPS.keys()),
    }
    with open(os.path.join(outdir, "plan.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f)
    print("wrote plan.json")


if __name__ == "__main__":
    src = sys.argv[1]
    outdir = sys.argv[2] if len(sys.argv) > 2 else "public"
    pxw = int(sys.argv[3]) if len(sys.argv) > 3 else 8000
    main(src, outdir, pxw)
