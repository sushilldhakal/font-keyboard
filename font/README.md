# Nagosi font

## Design

Hybrid: modern readability with traditional Sanskrit identity.

- **Base**: Noto Serif Devanagari 2.006 (OFL), a calm, high-contrast serif that reads well at text
  sizes and suits printed Sanskrit. Its 997 glyphs cover all of Devanagari, Devanagari Extended and
  Vedic Extensions.
- **Width axis removed**: Nagosi varies on weight only (100–900). This keeps files small and every
  generated glyph correct at every weight.
- **Latin**: Noto Serif's Latin, Latin-1, Latin Extended-A and Extended Additional, so IAST
  transliteration (ā ī ū ṛ ṝ ḷ ḹ ṃ ḥ ṅ ñ ṭ ḍ ṇ ś ṣ) sets in the same family. Shared digits and
  punctuation keep the Devanagari design.
- **Classical stacked conjuncts** (`glyphs/stacks.json`): consonants with no half form (ङ छ ट ठ ड ढ द ह)
  normally fall back to a visible halant: ड्ग shows as ड् + ग. The build shapes every pair with
  HarfBuzz and, for each pair that breaks, generates a stacked glyph. The second consonant is set
  smaller under the first, the classical Sanskrit style. These are TrueType composites, so they
  interpolate with the weight axis. Their advance follows the base consonant at every weight, and
  below-base vowel signs (ु ू ृ) move under the stack. 185 forms are generated. In the Surya Siddhanta,
  Agni Purana and Chanakya texts these clusters occur 4,549 times.
- **Stylistic sets**, usable in any language:
  - `ss01` Nepali forms: झ ५ ८ ९ (also automatic with `lang="ne"`)
  - `ss02` classical ल and श, the older forms seen in Sanskrit books
  - `ss03` Sanskrit conjunct forms such as क्त and क्र (also automatic with `lang="sa"`)

## Build

```bash
.venv/bin/python font/scripts/build.py        # add --no-static / --no-proof to go faster
```

1. Downloads the pinned upstream zips (`sources/upstream.json`) and checks their sha256.
2. Pins `wdth=100`, merges Latin, generates stacks, adds stylistic sets, renames to Nagosi.
3. Writes:
   - `builds/variable/Nagosi[wght].ttf`: install on desktop, bundle in apps
   - `builds/static/ttf/Nagosi-{Thin…Black}.ttf`: nine static weights for apps without variable font support
   - `../cdn/fonts/…woff2` and `../cdn/nagosi.css`: web
   - `builds/proof/*.png`: proof sheets to check by eye after every change
   - `builds/stacks.txt`: every generated conjunct and its glyph name

## Checking a change

```bash
.venv/bin/python -m pytest tests/font
```

This runs OTS on every file, checks coverage, names and static instances, checks that the sample
corpus has no missing glyphs, that every generated stack shapes to its glyph, that advances match
at weights 100/400/900, and that the stylistic sets work. Then look at `builds/proof/stacks.png`
and `stacks-weights.png`. Generated glyphs need a human eye.

## Taking the design further

The pipeline edits the compiled upstream binary, which is fast and exact. For redrawn letterforms
(a custom अ, झ, ण or a new headline treatment), work in the upstream `.glyphs` sources
(github.com/notofonts/devanagari, `sources/NotoSerifDevanagari.glyphspackage`) in Glyphs or
FontForge. Build them with fontmake, then point `sources/upstream.json` at the result. Every later
step (Latin merge, stacks, features, names, exports, tests) stays the same.

Known gaps:
- Latin kerning is not copied yet. Latin is spaced but not kerned.
- Stacks are generated for two-consonant clusters. Three-consonant clusters through those bases
  (ङ्क्ष, द्ग्र) still use the upstream fallback.
- The static TTFs are unhinted. They render well on macOS, iOS, Android and high-DPI Windows. For
  low-DPI Windows at small sizes, run ttfautohint on the static TTFs.
