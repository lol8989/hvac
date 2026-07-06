#!/usr/bin/env python
"""DXF -> 고해상도 PNG 전처리 (ezdxf + matplotlib).

대용량 도면(수만 엔티티)은 SVG를 브라우저가 계속 래스터화하느라 팬/줌이 느리다.
한 번 PNG로 구워 '단일 래스터 이미지'로 띄우면 즉각적이다.

핵심: PNG는 DXF 경계(extents)에 '정확히' 맞춰 렌더한다(축척 보존). 뷰어는 이 경계를
DXF 월드좌표로 알고 있어, 오버레이(실·실내기·실외기)를 DXF 좌표에 앵커링 → 왕복 정합 유지.

사용:  python tools/dxf_to_png.py "drawings/xxx.dxf" public/plan.png [PXW]
출력:  PNG + 같은 경로에 .json(경계/픽셀크기 메타 — 화면↔DXF 좌표 매핑용)
"""
import sys, json, os
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import ezdxf
from ezdxf.addons.drawing import RenderContext, Frontend
from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
from ezdxf.bbox import extents


def convert(src: str, dst: str, pxw: int = 8000) -> None:
    doc = ezdxf.readfile(src)
    msp = doc.modelspace()
    ents = [e for e in msp if e.dxftype() != "IMAGE"]
    b = extents(ents, fast=True)
    w = b.extmax[0] - b.extmin[0]
    h = b.extmax[1] - b.extmin[1]
    pxh = int(pxw * h / w)
    dpi = 200
    fig = plt.figure(figsize=(pxw / dpi, pxh / dpi), dpi=dpi)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.set_axis_off()
    Frontend(RenderContext(doc), MatplotlibBackend(ax)).draw_layout(
        msp, finalize=False, filter_func=lambda e: e.dxftype() != "IMAGE"
    )
    ax.set_xlim(b.extmin[0], b.extmax[0])
    ax.set_ylim(b.extmin[1], b.extmax[1])
    ax.set_aspect("equal")
    fig.savefig(dst, dpi=dpi, facecolor="white")
    # 화면↔DXF 좌표 매핑용 메타(뷰어가 오버레이를 DXF 좌표에 앵커링)
    meta = {
        "px": [pxw, pxh],
        "worldMin": [b.extmin[0], b.extmin[1]],
        "worldMax": [b.extmax[0], b.extmax[1]],
        "units": "mm",
    }
    with open(os.path.splitext(dst)[0] + ".json", "w", encoding="utf-8") as f:
        json.dump(meta, f)
    print(f"wrote {dst} ({pxw}x{pxh}) + meta json")


if __name__ == "__main__":
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else "public/plan.png"
    pxw = int(sys.argv[3]) if len(sys.argv) > 3 else 8000
    convert(src, dst, pxw)
