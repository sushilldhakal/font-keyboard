"""Font regression tests. Run after `python font/scripts/build.py`:  pytest tests/font"""
from __future__ import annotations

from pathlib import Path

import ots
import pytest
import uharfbuzz as hb
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
BUILDS = ROOT / "font" / "builds"
VF = BUILDS / "variable" / "VedicNepali[wght].ttf"
FIXTURES = ROOT / "tests" / "fixtures"

pytestmark = pytest.mark.skipif(not VF.exists(), reason="build the font first")


def hbfont(path=VF, wght=400):
    f = hb.Font(hb.Face(hb.Blob.from_file_path(str(path))))
    f.set_variations({"wght": wght})
    return f


def shape(text, font=None, features=None, lang=None):
    font = font or hbfont()
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    if lang:
        buf.language = lang
    hb.shape(font, buf, features or {})
    return [font.glyph_to_string(i.codepoint) for i in buf.glyph_infos], buf.glyph_positions


def test_all_outputs_pass_ots():
    files = list(BUILDS.rglob("*.ttf")) + list((ROOT / "cdn" / "fonts").rglob("*.woff2"))
    assert len(files) >= 20
    for f in files:
        assert ots.sanitize(str(f), capture_output=True).returncode == 0, f


def test_devanagari_block_coverage():
    cmap = TTFont(VF).getBestCmap()
    missing = [hex(c) for c in range(0x0900, 0x0980) if c not in cmap]  # all assigned since Unicode 8
    assert missing == []


def test_iast_and_latin_coverage():
    cmap = TTFont(VF).getBestCmap()
    iast = "āīūṛṝḷḹṃḥṅñṭḍṇśṣĀĪŪṚṜḶḸṂḤṄÑṬḌṆŚṢ"
    assert [c for c in iast if ord(c) not in cmap] == []
    assert all(c in cmap for c in range(0x20, 0x7F))


def test_axes_and_names():
    f = TTFont(VF)
    assert [(a.axisTag, a.minValue, a.defaultValue, a.maxValue) for a in f["fvar"].axes] == [("wght", 100, 400, 900)]
    assert f["name"].getDebugName(1) == "Vedic Nepali"
    assert "Noto" not in (f["name"].getDebugName(6) or "")
    assert f["OS/2"].achVendID == "NGSI"
    assert "Open Font License" in f["name"].getDebugName(13)


@pytest.mark.parametrize("style,weight", [("Thin", 100), ("Regular", 400), ("Bold", 700), ("Black", 900)])
def test_static_instances(style, weight):
    f = TTFont(BUILDS / "static" / "ttf" / f"VedicNepali-{style}.ttf")
    assert "fvar" not in f
    assert f["OS/2"].usWeightClass == weight
    assert f["name"].getDebugName(6) == f"VedicNepali-{style}"


def test_corpus_has_no_missing_glyphs():
    text = (FIXTURES / "corpus.txt").read_text(encoding="utf-8")
    names, _ = shape(text.replace("\n", " "))
    assert ".notdef" not in names


def test_generated_stacks_replace_visible_halant():
    lines = (BUILDS / "stacks.txt").read_text(encoding="utf-8").splitlines()
    assert len(lines) > 150
    for line in lines:
        cluster, glyph = line.split("\t")
        names, _ = shape(cluster)
        assert names == [glyph], (cluster, names)


@pytest.mark.parametrize("cluster", ["ड्ग", "द्श", "ङ्ल", "ट्क", "ड्भ"])
def test_common_sanskrit_stacks(cluster):
    names, _ = shape(cluster)
    assert "uni094D" not in names and names[0].endswith(".stack")


@pytest.mark.parametrize("wght", [100, 400, 900])
def test_stack_advance_matches_base_at_every_weight(wght):
    f = hbfont(wght=wght)
    _, stack = shape("ड्ग", f)
    _, base = shape("ड", f)
    assert stack[0].x_advance == base[0].x_advance


def test_below_mark_moves_under_subscript():
    _, plain = shape("डु")
    names, stacked = shape("ड्गु")
    assert names[0].endswith(".stack")
    assert stacked[1].y_offset < plain[1].y_offset


def test_stylistic_sets():
    assert shape("झ", features={"ss01": True})[0] == ["uni091D.NEP"]
    assert shape("ल", features={"ss02": True})[0] == ["uni0932.MAR"]
    assert shape("क्त", features={"ss03": True})[0] == ["uni0915094D0924.SAN"]
    assert shape("झ", lang="ne")[0] == ["uni091D.NEP"]


def test_reph_and_i_matra_shape():
    names, _ = shape("सर्वे")
    assert any("0930" in n and "094D" in n or n.startswith("uni0930094D") or "reph" in n.lower() for n in names), names
    names, _ = shape("कि")
    assert names[0].startswith("uni093F")


# ---------------------------------------------------------------- keyboards

import json as _json

KEYBOARDS = sorted((ROOT / "engine" / "keyboards").glob("*.json"))
# Standard Unicode a layout may insert that Vedic Nepali leaves to the system font.
SYSTEM_FONT_ONLY = {"卐"}


def _layout_outputs(path):
    d = _json.loads(path.read_text("utf8"))
    out = []
    for section in (d["rows"], [d.get("bottom", [])], d.get("numbers", [])):
        for row in section:
            for key in row:
                out += [s for s in key if isinstance(s, str) and s]
    return out


@pytest.mark.parametrize("path", KEYBOARDS, ids=lambda p: p.stem)
def test_font_covers_every_key(path):
    cmap = TTFont(VF).getBestCmap()
    missing = sorted({c for s in _layout_outputs(path) for c in s if ord(c) not in cmap and c not in SYSTEM_FONT_ONLY})
    assert not missing, [f"U+{ord(c):04X}" for c in missing]


@pytest.mark.parametrize("path", KEYBOARDS, ids=lambda p: p.stem)
def test_every_letter_key_shapes_cleanly(path):
    """A key that starts with a letter (क्ष, त्र, श्र, ज्ञ, ॐ...) shapes with no .notdef and no dotted circle."""
    font = hbfont()
    for s in _layout_outputs(path):
        if not ("ऄ" <= s[0] <= "ह" or s[0] in "ॐक़ख़ग़ज़ड़ढ़फ़य़ॠॡॲॳॴॵॶॷॿ"):
            continue
        glyphs, _ = shape(s, font)
        assert ".notdef" not in glyphs, s
        assert not any("dotted" in g.lower() or g in ("uni25CC",) for g in glyphs), (s, glyphs)
