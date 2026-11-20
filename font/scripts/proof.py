#!/usr/bin/env python3
"""Render proof sheets (PNG) of a built font with HarfBuzz shaping, at several weights.

  python font/scripts/proof.py font/builds/variable/VedicNepali[wght].ttf
Writes font/builds/proof/{specimen,stacks,weights}.png for human review.
"""
from __future__ import annotations

import sys
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.freetypePen import FreeTypePen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "font" / "builds" / "proof"


def shape(hbfont, text, wght, features=None):
    hbfont.set_variations({"wght": wght})
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(hbfont, buf, features or {})
    return buf.glyph_infos, buf.glyph_positions


def render_lines(path: Path, lines, out: Path, size=64, width=2200):
    tt = TTFont(path)
    hbfont = hb.Font(hb.Face(hb.Blob.from_file_path(str(path))))
    order = tt.getGlyphOrder()
    upem = tt["head"].unitsPerEm
    scale = size / upem
    line_h = int(size * 2.1)
    rows = []
    for text, wght, feats in lines:
        gs = tt.getGlyphSet(location={"wght": wght})
        pen = FreeTypePen(gs)
        x = 0
        infos, pos = shape(hbfont, text, wght, feats)
        for info, p in zip(infos, pos):
            gname = order[info.codepoint]
            gs[gname].draw(TransformPen(pen, (1, 0, 0, 1, x + p.x_offset, p.y_offset)))
            x += p.x_advance
        w_units = max(x, 1)
        img = pen.image(width=int(w_units * scale) + 20, height=line_h,
                        transform=(scale, 0, 0, scale, 10, line_h * 0.40), contain=False)
        rows.append(img)
    W = min(width, max(r.width for r in rows))
    sheet = Image.new("L", (W, sum(r.height for r in rows)), 255)
    y = 0
    for r in rows:
        # FreeTypePen gives an alpha mask; paint black on white
        a = r.split()[-1]
        sheet.paste(0, (0, y), a.crop((0, 0, min(a.width, W), a.height)))
        y += r.height
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    print(f"[proof] {out.relative_to(ROOT)}")


def main():
    path = Path(sys.argv[1])
    stacks_file = ROOT / "font" / "builds" / "stacks.txt"
    stacks = [l.split("\t")[0] for l in stacks_file.read_text().splitlines() if l] if stacks_file.exists() else []
    chunk = 14
    stack_lines = [(" ".join(stacks[i:i + chunk]), 400, None) for i in range(0, len(stacks), chunk)]
    if stacks:
        render_lines(path, stack_lines, OUT / "stacks.png", size=56)
        render_lines(path, [(" ".join(stacks[:chunk]), 100, None), (" ".join(stacks[:chunk]), 900, None),
                            (" ".join(s + "ु" for s in stacks[:chunk]), 400, None)], OUT / "stacks-weights.png", size=56)
    specimen = [
        ("वैदिक नेपाली — नेपाली र संस्कृतका लागि", 700, None),
        ("सर्वे भवन्तु सुखिनः सर्वे सन्तु निरामयाः।", 400, None),
        ("अङ्गुलि  षड्गुण  तद्भव  उद्घाटन  वाङ्मय  ह्लाद", 400, None),
        ("Vedic Nepali: sarve bhavantu sukhinaḥ — ṛṣi, jñāna, śāstra 0123 १२३४", 400, None),
        # one script per line: HarfBuzz picks the shaper from the first strong character
        ("झण्डा ५८९  लक्ष्मी शान्ति  भक्त वक्र", 400, None),
        ("झण्डा ५८९  लक्ष्मी शान्ति  भक्त वक्र", 400, {"ss01": True, "ss02": True, "ss03": True}),
    ]
    render_lines(path, specimen, OUT / "specimen.png", size=60)
    weights = [(f"{w}  नमस्ते संस्कृतम् Vedic Nepali", w, None) for w in (100, 200, 300, 400, 500, 600, 700, 800, 900)]
    render_lines(path, weights, OUT / "weights.png", size=52)


if __name__ == "__main__":
    main()
