#!/usr/bin/env python
"""DXF -> SVG 전처리 (ezdxf). 브라우저 뷰어는 런타임에 JS만 돌므로,
무거운 DXF 렌더는 Python(ezdxf)으로 오프라인 변환해 정적 SVG로 커밋한다.

사용:  python tools/dxf_to_svg.py public/sample.dxf public/sample.svg

- IMAGE(외부 래스터 참조) 엔티티는 파일이 없으면 로드 실패하므로 건너뛴다.
- 출력 SVG는 DXF 월드좌표/축척(mm)을 그대로 보존(viewBox).
"""
import sys
import ezdxf
from ezdxf.addons.drawing import Frontend, RenderContext
from ezdxf.addons.drawing import svg, layout


def convert(src: str, dst: str) -> None:
    doc = ezdxf.readfile(src)
    msp = doc.modelspace()
    backend = svg.SVGBackend()
    # IMAGE(외부 래스터)만 제외하고 벡터/해치/텍스트 렌더
    Frontend(RenderContext(doc), backend).draw_layout(
        msp, filter_func=lambda e: e.dxftype() != "IMAGE"
    )
    page = layout.Page(0, 0, layout.Units.mm, margins=layout.Margins.all(0))
    out = backend.get_string(page)
    with open(dst, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"wrote {dst} ({len(out)} bytes)")


if __name__ == "__main__":
    src = sys.argv[1] if len(sys.argv) > 1 else "public/sample.dxf"
    dst = sys.argv[2] if len(sys.argv) > 2 else "public/sample.svg"
    convert(src, dst)
