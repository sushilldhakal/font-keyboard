# Nagosi नगोसी

A Nepali–Sanskrit Devanagari typeface, plus the input tools to type it everywhere: a transliteration
engine, a web keyboard, an Android keyboard and an iOS keyboard. They share one engine and one set of data.

- **Font**: modern readability with traditional Sanskrit forms. Weights 100–900 in one variable font,
  plus nine static weights. Latin and IAST (ā ṛ ṣ ṃ ḥ …) included. Works on Android, iOS, Windows,
  macOS, Linux and every current browser. All files pass OTS, the font sanitizer that browsers run.
- **Classical conjuncts**: 185 stacked forms (ड्ग द्श ङ्ल ट्क …) that most Devanagari fonts break
  with a visible halant. They were chosen by shaping real Sanskrit texts, where they occur thousands of times.
- **Input**: type Nepali the way it sounds. `dhakal` gives ढकाल, `nepal` नेपाल, `tapai` तपाईं: a
  37,700-word Nepali dictionary and a letter-pair model pick the right spelling, and a Backspace right
  after undoes the pick. Or hold a key (`d` → ध ड ढ), or tap letters directly on the Nepali traditional keys (the default on-screen layout). IAST,
  ITRANS, Harvard-Kyoto and INSCRIPT are there for Sanskrit. Everything works offline.

| | Folder | Status |
| --- | --- | --- |
| Phase 1: font engineering | `font/` | v1.000 built and tested |
| Phase 2: optimization and CDN | `cdn/` | variable + static WOFF2, unicode-range CSS |
| Phase 3: transliteration engine | `engine/` | TypeScript reference, 106 tests (incl. standard-Unicode output) |
| Phase 4: web keyboard and editor | `web/` | `@nagosi/keyboard` + Type Studio |
| Phase 5: Android keyboard | `android/` | Kotlin IME + settings; debug APK and signed-ready release AAB build |
| Phase 6: iOS keyboard | `ios/` | Swift package, keyboard extension and settings app; builds with ML Kit |

**Nagosi Indic**, the phone keyboard, has four keyboards, switched with ‹ › on the space bar: नेपाली
(traditional keys, direct Nepali), नेपाली (Roman: type as it sounds, with suggestions), वैदिक (direct
Sanskrit with Vedic marks) and Sanskrit (IAST). A ✍ page recognises handwritten words. Every keyboard
inserts plain standard Unicode, so the text reads correctly in any font; the font only draws it.
Production steps: [docs/PRODUCTION.md](docs/PRODUCTION.md). Device checks: [docs/DEVICE-TESTING.md](docs/DEVICE-TESTING.md).

## Layout

```
font/       sources (pinned upstream), glyphs (stack config), features, scripts, builds (TTF)
engine/     transliteration (schemes + layouts JSON), unicode, suggestions (dictionaries)
web/        keyboard (npm package), editor (standalone typing tool)
android/    engine (Kotlin port) + app (IME)
ios/        NagosiEngine (Swift package) + NagosiKeyboard (extension) + NagosiApp
cdn/        @nagosi/font: CSS and WOFF2
tests/      font tests, shared vectors every engine port must pass
```

## Build and test

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python font/scripts/build.py      # font → font/builds, cdn/fonts, proof PNGs
.venv/bin/python -m pytest tests/font       # 25 font tests (OTS, coverage, every keyboard key)
pnpm install && pnpm test                   # engine + web editor
(cd android && ./gradlew :engine:test :app:assembleDebug)
(cd ios/NagosiEngine && swift test)
```

## Typing a word like ढकाल

| How | Keys | Result |
| --- | --- | --- |
| As it sounds | `dhakal` Space | ढकाल (dictionary pick; Backspace right after gives धकल) |
| Pick another spelling | `dhakal`, tap a candidate | ढकाल, धकाल, ढकल … |
| Exact letters with capitals | `Dhakaal` | ढकाल, never changed |
| Hold a key (on-screen) | hold `d` → ढ, `a`, `k`, hold `a` → आ, `l` | ढकाल |
| Nepali traditional keys (default) | ढ क ा ल | ढकाल |
| Handwriting (Android, iOS) | ✍, write ढकाल | ढकाल |

The on-screen keyboards switch with ‹ › on the space bar: नेपाली (traditional), नेपाली (Roman),
वैदिक (Vedic Sanskrit with svara marks) and Sanskrit (IAST).

## One engine, three platforms

The transliteration rules live once, as JSON in `engine/transliteration/schemes/`. The TypeScript
engine is the reference. The Kotlin (`android/engine`) and Swift (`ios/NagosiEngine`) ports run the
same algorithm and must produce identical output for `tests/vectors/*.json`, so a word typed on the
web, on Android or on iPhone comes out the same.

## Licenses

Font: SIL Open Font License 1.1 (`font/OFL.txt`). Nagosi is derived from Noto Serif Devanagari and
Noto Serif, both OFL. Code: MIT. See `LICENSE`.
