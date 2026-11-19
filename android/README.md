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

Not yet tested on devices. Before a Play release: test on a few real phones (small screen, Android 7 and 15,
dark mode, a hardware keyboard), add a release signing config, and add a privacy policy (the keyboard
collects nothing: learned words stay on the phone).

About the font: Android has no supported way to install a system-wide font. Apps use Nagosi by
bundling the TTFs (`font/builds`). The keyboard uses it for its own keys and suggestions.
