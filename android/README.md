# Nagosi keyboard for Android

- `engine/`: pure Kotlin port of `engine/` (TypeScript reference), unit-tested on the JVM against `tests/vectors`.
- `app/`: the input method (`NagosiIme`), its key view and a setup screen. Schemes, dictionaries and
  the Nagosi font are copied from the repository into the APK at build time (`syncNagosiAssets`), so
  typing is fully offline and there is one source of truth.

```bash
./gradlew :engine:test            # shared vectors
./gradlew :app:assembleDebug      # app/build/outputs/apk/debug/app-debug.apk
```

Install the APK, open **Nagosi Keyboard**, tap *Open keyboard settings* and enable Nagosi, then
*Choose keyboard*. The नेपाली key cycles Romanized Nepali → IAST → INSCRIPT; 🌐 switches to your other keyboards.

Keyboards: the ‹ › arrows on the space bar (or a swipe along it) switch between
- **नेपाली**: Nepali traditional keys (default). Every key types its letter (ढ क ा ल → ढकाल); hold a
  key, or press ⇧ first, for the small letter in its corner (क → क्ष, ि → ी).
- **नेपाली (Roman)**: type as it sounds (`dhakal` → ढकाल); Space takes the dictionary word, Backspace
  right after undoes it; hold a key for related letters (`d` → ध ड ढ).
- **वैदिक**: Vedic Sanskrit: vowels on the left (⇧ gives their signs), consonants in varga order,
  svara marks ॑ ॒ ᳚ ᳛, pluta ३, ꣳ ᳲ ᳵ.
- **Sanskrit (IAST)**: `saṃskṛtam` → संस्कृतम्.

१२३ opens digits. ✍ opens handwriting: write a word, pick it from the suggestion bar or press
खाली ठाउँ (space) to take the first one. Recognition is Google ML Kit Digital Ink, on the device; the
Nepali model (~20 MB) downloads the first time ✍ is opened and then works offline.

Not yet tested on devices. Before a Play release: test on a few real phones (small screen, Android 7 and 15,
dark mode, a hardware keyboard), add a release signing config, and add a privacy policy (the keyboard
collects nothing: learned words stay on the phone).

About the font: Android has no supported way to install a system-wide font. Apps use Nagosi by
bundling the TTFs (`font/builds`). The keyboard uses it for its own keys and suggestions.
