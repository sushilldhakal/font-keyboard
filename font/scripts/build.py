#!/usr/bin/env python3
"""Build the Nagosi font family.

Pipeline (every step is deterministic and re-runnable):
  1. fetch    pinned OFL upstream fonts (font/sources/upstream.json), sha256-checked
  2. pin      drop the width axis (wdth=100); Nagosi varies on weight only (100-900)
  3. latin    copy Latin, Latin-1, Latin Extended-A and the IAST letters from Noto Serif
  4. stacks   generate classical vertical conjuncts the upstream breaks with a visible halant
  5. features ss01 Nepali forms, ss02 classical ल/श, ss03 Sanskrit conjuncts (any language)
  6. names    rename to Nagosi, version, vendor, OFL notice
  7. export   variable TTF/WOFF2, static TTF/WOFF2 for every weight, web subsets, proof PNGs

Usage:  python font/scripts/build.py [--no-static] [--no-proof]
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import io
import json
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

from fontTools import subset
from fontTools.pens.boundsPen import BoundsPen
from fontTools.ttLib import TTFont, newTable
from fontTools.ttLib.tables import otTables as ot
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphComponent
from fontTools.ttLib.tables.TupleVariation import TupleVariation
from fontTools.varLib import instancer
from fontTools.varLib.hvar import add_HVAR

ROOT = Path(__file__).resolve().parents[2]
FONT = ROOT / "font"
CACHE = FONT / ".cache"
BUILDS = FONT / "builds"
CDN = ROOT / "cdn"

FAMILY = "Nagosi"
VERSION = "1.000"
VENDOR = "NGSI"

WEIGHTS = [
    (100, "Thin"), (200, "ExtraLight"), (300, "Light"), (400, "Regular"), (500, "Medium"),
    (600, "SemiBold"), (700, "Bold"), (800, "ExtraBold"), (900, "Black"),
]

# Latin coverage: ASCII, Latin-1, Latin Extended-A (ś), spacing modifiers, combining marks,
# Latin Extended Additional (IAST: ṛ ṝ ḷ ḹ ṃ ḥ ṅ ṭ ḍ ṇ ṣ), punctuation, currency, arrows.
LATIN_UNICODES = (
    "U+0020-007E,U+00A0-017F,U+0192,U+0218-021B,U+02BB-02BC,U+02C6-02DD,U+0300-036F,"
    "U+1E00-1EFF,U+2000-206F,U+20A0-20C0,U+2100-2122,U+2190-2193,U+2212,U+2215"
)

HALANT = "uni094D"


def log(msg: str) -> None:
    print(f"[nagosi] {msg}", flush=True)


# --------------------------------------------------------------------------- 1. fetch
def fetch(spec: dict) -> Path:
    CACHE.mkdir(parents=True, exist_ok=True)
    zpath = CACHE / Path(spec["url"]).name
    if not zpath.exists() or sha256(zpath) != spec["sha256"]:
        log(f"downloading {spec['name']} {spec['version']}")
        with urllib.request.urlopen(spec["url"]) as r:  # noqa: S310 (pinned https url)
            data = r.read()
        zpath.write_bytes(data)
    got = sha256(zpath)
    if got != spec["sha256"]:
        zpath.unlink(missing_ok=True)
        sys.exit(f"sha256 mismatch for {spec['url']}: got {got}")
    out = CACHE / Path(spec["member"]).name
    with zipfile.ZipFile(zpath) as z:
        out.write_bytes(z.read(spec["member"]))
    return out


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


# --------------------------------------------------------------------------- 2. pin
def pin_width(font: TTFont) -> TTFont:
    pinned = instancer.instantiateVariableFont(font, {"wdth": 100}, inplace=False)
    buf = io.BytesIO()
    pinned.save(buf)
    buf.seek(0)
    return TTFont(buf)


# --------------------------------------------------------------------------- 3. latin
def merge_latin(deva: TTFont, latin: TTFont) -> list[str]:
    """Copy Latin glyphs (outlines, variations, metrics, GDEF class) into the Devanagari font.

    Both fonts share UPM, axes and avar, so gvar deltas transfer unchanged. Codepoints the
    Devanagari font already maps (digits, punctuation) keep the Devanagari design so the two
    scripts sit on one rhythm. Latin kerning is not copied yet (see font/README.md).
    """
    opts = subset.Options()
    opts.layout_features = []
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    opts.glyph_names = True
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=subset.parse_unicodes(LATIN_UNICODES))
    sub.subset(latin)

    dcmap = deva.getBestCmap()
    lcmap = latin.getBestCmap()
    wanted = {cp: g for cp, g in lcmap.items() if cp not in dcmap}

    lglyf, lgvar, lhmtx = latin["glyf"], latin["gvar"], latin["hmtx"]
    dglyf, dgvar, dhmtx = deva["glyf"], deva["gvar"], deva["hmtx"]
    order = list(deva.getGlyphOrder())
    existing = set(order)
    rename: dict[str, str] = {}

    def closure(name: str, acc: list[str]) -> None:
        if name in acc:
            return
        g = lglyf[name]
        if g.isComposite():
            for c in g.components:
                closure(c.glyphName, acc)
        acc.append(name)

    todo: list[str] = []
    for g in wanted.values():
        closure(g, todo)
    for name in todo:
        rename[name] = name if name not in existing else f"{name}.latn"

    added = []
    for name in todo:
        new = rename[name]
        if new in existing:
            continue
        g = copy.deepcopy(lglyf[name])
        if g.isComposite():
            for c in g.components:
                c.glyphName = rename[c.glyphName]
        order.append(new)
        existing.add(new)
        dglyf.glyphs[new] = g
        dhmtx.metrics[new] = lhmtx[name]
        dgvar.variations[new] = copy.deepcopy(lgvar.variations.get(name, []))
        added.append(new)
    dglyf.glyphOrder = order
    deva.setGlyphOrder(order)

    for table in deva["cmap"].tables:
        if table.isUnicode():
            for cp, g in wanted.items():
                if cp <= 0xFFFF or table.format in (12, 13):
                    table.cmap[cp] = rename[g]

    lclass = latin["GDEF"].table.GlyphClassDef.classDefs
    dclass = deva["GDEF"].table.GlyphClassDef.classDefs
    for name in todo:
        if name in lclass:
            dclass[rename[name]] = lclass[name]
    return added


# --------------------------------------------------------------------------- 4. stacks
def point_bounds(font: TTFont, name: str, below: float | None = None):
    gs = font.getGlyphSet()
    pen = BoundsPen(gs)
    gs[name].draw(pen)
    if below is None or pen.bounds is None:
        return pen.bounds
    # body bounds: ignore the headline (shirorekha) by only looking at on-curve points below it
    glyf = font["glyf"]
    coords, _, _ = glyf[name].getCoordinates(glyf)
    xs = [x for x, y in coords if y < below]
    return (min(xs), pen.bounds[1], max(xs), pen.bounds[3]) if xs else pen.bounds


def shapes_with_visible_halant(font_path: Path, text: str) -> bool:
    import uharfbuzz as hb

    font = hb.Font(hb.Face(hb.Blob.from_file_path(str(font_path))))
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(font, buf, {})
    return any(font.glyph_to_string(i.codepoint) == HALANT for i in buf.glyph_infos)


def name_to_text(name: str) -> str:
    hexes = name[3:]
    return "".join(chr(int(hexes[i:i + 4], 16)) for i in range(0, len(hexes), 4))


def generate_stacks(font: TTFont, probe_path: Path, cfg: dict) -> list[tuple[str, str, str]]:
    glyf, gvar, hmtx = font["glyf"], font["gvar"], font["hmtx"]
    d = cfg["defaults"]
    order = list(font.getGlyphOrder())
    made: list[tuple[str, str, str]] = []
    headline_bottom = 540  # below the shirorekha for every weight

    for base, bcfg in cfg["bases"].items():
        p = {**d, **bcfg}
        bx0, by0, bx1, _ = point_bounds(font, base, below=headline_bottom)
        badv = hmtx[base][0]
        for subg in cfg["subscripts"]:
            text = name_to_text(base) + "्" + name_to_text(subg)
            if not shapes_with_visible_halant(probe_path, text):
                continue
            new = f"{base}094D{subg[3:]}.stack"
            if new in glyf.glyphs:
                continue
            sx0, sy0, sx1, sy1 = point_bounds(font, subg)
            s = p["scale"]
            s = min(s, (badv * p["max_width_ratio"]) / (sx1 - sx0))
            top_limit = min(by0, 0) - p["gap"]
            bottom = p["bottom"]
            if bottom + s * (sy1 - sy0) > top_limit:  # would collide with the base: go deeper
                bottom = top_limit - s * (sy1 - sy0)
            if bottom < p["max_depth"]:  # too deep: shrink instead
                bottom = p["max_depth"]
                s = (top_limit - bottom) / (sy1 - sy0)
            s = max(s, p["min_scale"])
            body_center = (bx0 + bx1) / 2
            dx = round(body_center - s * (sx0 + sx1) / 2)
            dy = round(bottom - s * sy0)

            c0 = GlyphComponent()
            c0.glyphName, c0.x, c0.y, c0.flags = base, 0, 0, 0x0400  # OVERLAP_COMPOUND
            c1 = GlyphComponent()
            c1.glyphName, c1.x, c1.y, c1.flags = subg, dx, dy, 0
            c1.transform = [[s, 0], [0, s]]
            g = Glyph()
            g.numberOfContours = -1
            g.components = [c0, c1]
            glyf.glyphs[new] = g
            order.append(new)
            hmtx.metrics[new] = (badv, hmtx[base][1])

            # Variations: advance follows the base exactly; the subscript drifts by half the
            # base's width change so it stays centred under the body at every weight.
            variations = []
            for tv in gvar.variations.get(base, []):
                coords = tv.coordinates
                adv_dx = (coords[-3][0] if coords[-3] else 0) - (coords[-4][0] if coords[-4] else 0)
                new_coords = [(0, 0), (round(adv_dx * (1 - s) / 2), 0), coords[-4] or (0, 0),
                              coords[-3] or (0, 0), coords[-2] or (0, 0), coords[-1] or (0, 0)]
                variations.append(TupleVariation(dict(tv.axes), new_coords))
            gvar.variations[new] = variations
            made.append((base, subg, new))
        glyf.glyphOrder = order
    font.setGlyphOrder(order)
    glyf.glyphOrder = order

    gdef = font["GDEF"].table.GlyphClassDef.classDefs
    for base, _, new in made:
        gdef[new] = gdef.get(base, 1)

    add_stack_gsub(font, made)
    add_stack_marks(font, made)
    return made


def _features(table, tag):
    return [fr for fr in table.FeatureList.FeatureRecord if fr.FeatureTag == tag]


def _new_lookup(table, lookup_type: int, subtable) -> int:
    lk = ot.Lookup()
    lk.LookupType = lookup_type
    lk.LookupFlag = 0
    lk.SubTable = [subtable]
    lk.SubTableCount = 1
    table.LookupList.Lookup.append(lk)
    table.LookupList.LookupCount = len(table.LookupList.Lookup)
    return len(table.LookupList.Lookup) - 1


def add_stack_gsub(font: TTFont, made) -> None:
    gsub = font["GSUB"].table
    st = ot.LigatureSubst()
    st.ligatures = {}
    for base, subg, new in made:
        lig = ot.Ligature()
        lig.Component = [HALANT, subg]
        lig.LigGlyph = new
        lig.CompCount = 3
        st.ligatures.setdefault(base, []).append(lig)
    idx = _new_lookup(gsub, 4, st)
    for fr in _features(gsub, "pres"):
        fr.Feature.LookupListIndex.append(idx)
        fr.Feature.LookupCount = len(fr.Feature.LookupListIndex)


def add_stack_marks(font: TTFont, made) -> None:
    """Give each stack the base consonant's mark anchors; below-marks move under the subscript."""
    gpos = font["GPOS"].table
    glyf = font["glyf"]
    below = {i for fr in _features(gpos, "blwm") for i in fr.Feature.LookupListIndex}
    above = {i for fr in _features(gpos, "abvm") for i in fr.Feature.LookupListIndex}
    for li in sorted(below | above):
        lookup = gpos.LookupList.Lookup[li]
        if lookup.LookupType != 4:
            continue
        for st in lookup.SubTable:
            cov = st.BaseCoverage.glyphs
            for base, _, new in made:
                if base not in cov or new in cov:
                    continue
                rec = copy.deepcopy(st.BaseArray.BaseRecord[cov.index(base)])
                if li in below:
                    g = glyf[new]
                    g.recalcBounds(glyf)
                    b = glyf[base]
                    b.recalcBounds(glyf)
                    shift = g.yMin - min(b.yMin, 0)
                    for a in rec.BaseAnchor:
                        if a is not None:
                            a.YCoordinate = round(a.YCoordinate + shift)
                cov.append(new)
                st.BaseArray.BaseRecord.append(rec)
            st.BaseArray.BaseCount = len(st.BaseArray.BaseRecord)


# --------------------------------------------------------------------------- 5. features
STYLISTIC_SETS = {
    # tag: (name, upstream locl language whose lookups it exposes)
    "ss01": ("Nepali forms: झ ५ ८ ९", "NEP "),
    "ss02": ("Classical ल and श", "MAR "),
    "ss03": ("Sanskrit conjuncts: क्त क्र", "SAN "),
}


def add_stylistic_sets(font: TTFont) -> None:
    gsub = font["GSUB"].table
    name = font["name"]
    locl_by_lang: dict[str, list[int]] = {}
    for sr in gsub.ScriptList.ScriptRecord:
        for lr in sr.Script.LangSysRecord:
            for fi in lr.LangSys.FeatureIndex:
                fr = gsub.FeatureList.FeatureRecord[fi]
                if fr.FeatureTag == "locl":
                    locl_by_lang.setdefault(lr.LangSysTag, fr.Feature.LookupListIndex)

    new_indices = []
    for tag, (label, lang) in STYLISTIC_SETS.items():
        lookups = locl_by_lang.get(lang)
        if not lookups:
            continue
        feat = ot.Feature()
        feat.LookupListIndex = list(lookups)
        feat.LookupCount = len(lookups)
        params = ot.FeatureParamsStylisticSet()
        params.Version = 0
        params.UINameID = name.addMultilingualName({"en": label}, mac=False)
        feat.FeatureParams = params
        fr = ot.FeatureRecord()
        fr.FeatureTag = tag
        fr.Feature = feat
        gsub.FeatureList.FeatureRecord.append(fr)
        new_indices.append(len(gsub.FeatureList.FeatureRecord) - 1)
    gsub.FeatureList.FeatureCount = len(gsub.FeatureList.FeatureRecord)

    # Feature records must be sorted by tag; remap every LangSys index list.
    recs = gsub.FeatureList.FeatureRecord
    order = sorted(range(len(recs)), key=lambda i: recs[i].FeatureTag)
    remap = {old: new for new, old in enumerate(order)}
    gsub.FeatureList.FeatureRecord = [recs[i] for i in order]
    for sr in gsub.ScriptList.ScriptRecord:
        langsyses = [sr.Script.DefaultLangSys] + [lr.LangSys for lr in sr.Script.LangSysRecord]
        for ls in langsyses:
            if ls is None:
                continue
            idx = [remap[i] for i in ls.FeatureIndex]
            if sr.ScriptTag in ("deva", "dev2"):
                idx += [remap[i] for i in new_indices]
            ls.FeatureIndex = sorted(set(idx))
            ls.FeatureCount = len(ls.FeatureIndex)


# --------------------------------------------------------------------------- 6. names
def rename(font: TTFont) -> None:
    name = font["name"]
    old_copyright = name.getDebugName(0) or ""
    for rec in list(name.names):
        s = rec.toUnicode()
        s2 = s.replace("Noto Serif Devanagari", FAMILY).replace("NotoSerifDevanagari", FAMILY)
        if s2 != s:
            rec.string = s2
    name.removeNames(nameID=7)  # Noto trademark does not apply to the derivative
    set_name(font, 0, f"Copyright 2026 The Nagosi Project Authors (https://github.com/sushilldhakal/font-keyboard). "
                      f"Derived from Noto Serif Devanagari and Noto Serif: {old_copyright}")
    set_name(font, 3, f"{VERSION};{VENDOR};{FAMILY}")
    set_name(font, 5, f"Version {VERSION}")
    set_name(font, 8, "Nagosi Project")
    set_name(font, 10, "Nagosi: a Nepali and Sanskrit Devanagari typeface with classical conjuncts, "
                       "IAST Latin and weights 100 to 900. Derived from the Noto Serif family.")
    set_name(font, 11, "https://github.com/sushilldhakal/font-keyboard")
    set_name(font, 13, "This Font Software is licensed under the SIL Open Font License, Version 1.1. "
                       "This license is available with a FAQ at: https://openfontlicense.org")
    set_name(font, 14, "https://openfontlicense.org")
    font["OS/2"].achVendID = VENDOR
    font["head"].fontRevision = float(VERSION)


def set_name(font: TTFont, nid: int, value: str) -> None:
    font["name"].setName(value, nid, 3, 1, 0x409)
    font["name"].setName(value, nid, 1, 0, 0)


# --------------------------------------------------------------------------- 7. export
def save(font: TTFont, path: Path, flavor: str | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    f = copy.deepcopy(font) if flavor else font
    f.flavor = flavor
    f.save(path)
    log(f"wrote {path.resolve().relative_to(ROOT)} ({path.stat().st_size // 1024} KB)")


def export_static(vf_path: Path) -> list[Path]:
    out = []
    for wght, style in WEIGHTS:
        vf = TTFont(vf_path)
        inst = instancer.instantiateVariableFont(vf, {"wght": wght}, updateFontNames=True)
        n = inst["name"]
        family = FAMILY if style in ("Regular", "Bold") else f"{FAMILY} {style}"
        sub = style if style in ("Regular", "Bold") else "Regular"
        for nid, val in ((1, family), (2, sub), (4, f"{FAMILY} {style}"),
                         (6, f"{FAMILY}-{style}"), (16, FAMILY), (17, style)):
            set_name(inst, nid, val)
        if style in ("Regular", "Bold"):
            n.removeNames(nameID=16)
            n.removeNames(nameID=17)
        os2 = inst["OS/2"]
        os2.usWeightClass = wght
        os2.fsSelection &= ~0b1100001  # clear ITALIC/BOLD/REGULAR
        os2.fsSelection |= 0b100000 if style == "Bold" else (0b1000000 if style == "Regular" else 0)
        inst["head"].macStyle = 1 if style == "Bold" else 0
        p = BUILDS / "static" / "ttf" / f"{FAMILY}-{style}.ttf"
        save(inst, p)
        save(inst, CDN / "fonts" / "static" / f"{FAMILY}-{style}.woff2", "woff2")
        out.append(p)
    return out


def export_web_subsets(vf_path: Path) -> None:
    ranges = {
        "devanagari": "U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20A8,U+20B9,U+25CC,U+A830-A839,U+A8E0-A8FF,U+11B00-11B09",
        "latin": "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,"
                 "U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
        "latin-ext": "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,"
                     "U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
    }
    for key, uni in ranges.items():
        f = TTFont(vf_path)
        opts = subset.Options()
        opts.layout_features = ["*"]
        opts.flavor = "woff2"
        opts.name_IDs = ["*"]
        opts.notdef_outline = True
        s = subset.Subsetter(opts)
        s.populate(unicodes=subset.parse_unicodes(uni))
        s.subset(f)
        save(f, CDN / "fonts" / "subsets" / f"{FAMILY}-{key}-Variable.woff2", "woff2")
    write_css(ranges)


def write_css(ranges: dict) -> None:
    """cdn/nagosi.css: variable subsets by unicode-range (browsers fetch only the scripts a page uses).
    cdn/nagosi-static.css: one file per weight for old browsers without variable font support."""
    head = (f"/* Nagosi {VERSION} | SIL Open Font License 1.1 | https://github.com/sushilldhakal/font-keyboard */\n"
            "/* Generated by font/scripts/build.py. Do not edit. */\n")
    css = head
    for key, uni in ranges.items():
        css += ("@font-face {\n  font-family: \"Nagosi\";\n  font-style: normal;\n  font-weight: 100 900;\n"
                "  font-display: swap;\n"
                f"  src: url(\"./fonts/subsets/{FAMILY}-{key}-Variable.woff2\") format(\"woff2-variations\"),\n"
                f"       url(\"./fonts/subsets/{FAMILY}-{key}-Variable.woff2\") format(\"woff2\");\n"
                f"  unicode-range: {uni.replace(',', ', ')};\n}}\n")
    css += (".nagosi { font-family: \"Nagosi\", \"Noto Serif Devanagari\", \"Kohinoor Devanagari\", "
            "\"Mangal\", serif; }\n.nagosi-nepali { font-feature-settings: \"ss01\"; }\n"
            ".nagosi-classical { font-feature-settings: \"ss02\", \"ss03\"; }\n")
    (CDN / "nagosi.css").write_text(css)
    st = head
    for wght, style in WEIGHTS:
        st += ("@font-face {\n  font-family: \"Nagosi\";\n  font-style: normal;\n"
               f"  font-weight: {wght};\n  font-display: swap;\n"
               f"  src: url(\"./fonts/static/{FAMILY}-{style}.woff2\") format(\"woff2\");\n}}\n")
    (CDN / "nagosi-static.css").write_text(st)
    (CDN / "fonts" / "ranges.json").write_text(json.dumps(ranges, indent=2) + "\n")
    log("wrote cdn/nagosi.css, cdn/nagosi-static.css")


def proof(vf_path: Path, made) -> None:
    try:
        from fontTools.pens.freetypePen import FreeTypePen  # noqa: F401
    except Exception:
        log("freetype-py missing: skipping proof sheets")
        return
    import subprocess

    subprocess.run([sys.executable, str(FONT / "scripts" / "proof.py"), str(vf_path)], check=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--no-static", action="store_true")
    ap.add_argument("--no-proof", action="store_true")
    args = ap.parse_args()

    up = json.loads((FONT / "sources" / "upstream.json").read_text())
    stacks_cfg = json.loads((FONT / "glyphs" / "stacks.json").read_text())

    deva = pin_width(TTFont(fetch(up["devanagari"])))
    latin = pin_width(TTFont(fetch(up["latin"])))
    probe = CACHE / "probe.ttf"
    deva.save(probe)  # shaping probe: the upstream as it is, to find broken clusters
    deva = TTFont(probe)

    added = merge_latin(deva, latin)
    log(f"latin: {len(added)} glyphs merged")
    made = generate_stacks(deva, probe, stacks_cfg)
    log(f"stacks: {len(made)} classical conjuncts generated")
    add_stylistic_sets(deva)
    rename(deva)

    if "HVAR" in deva:
        del deva["HVAR"]
    add_HVAR(deva)
    deva["maxp"].recalc(deva)
    deva["post"].formatType = 2.0

    vf_path = BUILDS / "variable" / f"{FAMILY}[wght].ttf"
    save(deva, vf_path)
    save(TTFont(vf_path), CDN / "fonts" / f"{FAMILY}-Variable.woff2", "woff2")
    export_web_subsets(vf_path)
    if not args.no_static:
        export_static(vf_path)
    (BUILDS / "stacks.txt").write_text(
        "\n".join(f"{name_to_text(b)}्{name_to_text(s)}\t{n}" for b, s, n in made) + "\n")
    if not args.no_proof:
        proof(vf_path, made)
    log("done")


if __name__ == "__main__":
    main()
