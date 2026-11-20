# Nagosi Indic: production guide

One Devanagari keyboard for Android and iOS, with one offline engine underneath. This page covers
what is built, how each requirement is met and checked, and every step from a clean checkout to the
Play Store and the App Store.

## What the keyboard does

| Requirement | Where | How it's checked |
| --- | --- | --- |
| **Romanized Nepali** with live suggestions and a dictionary (`dhakal` → ढकाल) | keyboard `nepali-roman`; `engine/transliteration`, `engine/suggestions` (37,703-word `ne.json`, `bigrams.json`) | `engine/engine.test.ts`, shared vectors `tests/vectors/*.json` run in TS, Kotlin and Swift |
| **Direct Nepali** typing | keyboard `nepali-traditional` (`engine/keyboards/nepali-traditional.json`): tap the big letter, hold for the corner letter | layout tests in all three engines, plus font coverage and shaping per key |
| **Direct Sanskrit with Vedic marks** | keyboard `vedic` (`engine/keyboards/vedic.json`): svara ॑ ॒ ᳚ ᳛, ꣳ ᳲ ᳵ, pluta ३, ⇧ for vowel signs. Also `iast` for romanized Sanskrit | same as above |
| **Draw words** (handwriting) | ✍ page on every keyboard: `android/.../Handwriting.kt`, `ios/NagosiKeyboard/HandwritingPad.swift` (Google ML Kit Digital Ink, on the device) | builds on both platforms; device check in [DEVICE-TESTING.md](DEVICE-TESTING.md) |
| **Standard Unicode output only** | every key, scheme and dictionary word | `standard unicode output` tests: only Devanagari, Vedic Extensions, Devanagari Extended, ZWJ/ZWNJ, ASCII, ₹ and 卐; no Private Use Area; everything NFC |
| **One shared offline engine and JSON layouts** | `engine/` (TypeScript reference). `engine/keyboards/*.json` and `engine/transliteration/schemes/*.json` are copied into the Android assets and the iOS bundle at build time | CI fails if the iOS copy differs from `engine/` |
| **Kotlin Android IME** | `android/app` (IME), `android/engine` (Kotlin port of the engine) | `./gradlew :engine:test :app:assembleDebug` |
| **Swift iOS keyboard extension** | `ios/NagosiKeyboard`, `ios/NagosiEngine` (Swift package) | `swift test`, plus a full app and extension build in CI |
| **Settings** | Android `SetupActivity`; iOS `NagosiApp` (shared with the keyboard through App Group `group.np.nagosi.keyboard`, `ios/Shared/NagosiSettings.swift`): keyboard choice, whether Space picks the best word, forget learned words, handwriting and privacy notes | manual, see DEVICE-TESTING.md |
| **Unicode / OpenType validation** | `tests/font/test_font.py`: OTS sanitizer, block coverage, 185 stacked conjuncts, every keyboard key in the font's cmap, every letter key shapes with no `.notdef` or dotted circle (HarfBuzz) | `pytest tests/font` |
| **Font rendering independent from input** | the engine and the keyboards never reference a font. They insert plain Unicode; the reader's app draws it with whatever font it uses. The keyboard uses Nagosi only to draw its own key labels, and falls back to the system font (卐 always comes from the system font) | the Unicode tests above; the engine package has no font dependency |

Typing never touches the network. The only download is the handwriting model (about 20 MB, once).
On Android it needs the `INTERNET` permission. On iOS it needs **Allow Full Access**. Learned words and
settings never leave the device.

## From a clean checkout

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python font/scripts/build.py --no-proof
.venv/bin/python -m pytest tests/font -q          # OpenType + keyboard coverage
pnpm install --frozen-lockfile
pnpm --filter @nagosi/engine build && pnpm --filter @nagosi/keyboard build
pnpm -r typecheck && pnpm -r test                 # engine (Unicode, vectors, layouts) + editor
(cd android && ./gradlew :engine:test :app:assembleDebug)
(cd ios/NagosiEngine && swift test)
brew install xcodegen cocoapods
cd ios && ./scripts/sync-resources.sh && xcodegen && LANG=en_US.UTF-8 pod install
xcodebuild -workspace Nagosi.xcworkspace -scheme Nagosi -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build
```

CI (`.github/workflows/ci.yml`) runs all of this on every push.

## Changing a keyboard

1. Edit `engine/keyboards/<id>.json`. A key is `[tap, hold]` or `[tap, hold, shift]`; `shift: "explicit"` means ⇧ only uses the third value.
2. `pnpm --filter @nagosi/engine build` regenerates the typed `keyboards` export.
3. `ios/scripts/sync-resources.sh` copies it into the Swift package. Android copies it at build time.
4. Run the tests. A key that inserts something outside standard Devanagari, isn't NFC, or isn't in the font fails CI.

## Android release (Google Play)

1. **Signing key**, made once and kept safe; losing it means you can never update the app:
   ```bash
   keytool -genkeypair -v -keystore nagosi-release.jks -alias nagosi -keyalg RSA -keysize 4096 -validity 10000
   ```
   Then create `android/keystore.properties` (git-ignored):
   ```
   storeFile=../nagosi-release.jks
   storePassword=…
   keyAlias=nagosi
   keyPassword=…
   ```
   Turn on Play App Signing in the Play Console, so Google holds the app key and this one becomes the upload key.
2. **Version**: raise `versionCode` (and `versionName`) in `android/app/build.gradle.kts` for every upload.
3. **Build**: `cd android && ./gradlew :app:bundleRelease`, which writes `app/build/outputs/bundle/release/app-release.aab` (about 19 MB, R8-minified).
4. **Play Console**:
   - Create the app `np.nagosi.keyboard`.
   - Store listing in Nepali and English, with screenshots of each keyboard and of handwriting.
   - **Privacy policy URL**: required for keyboards. It says no data is collected, learned words stay on the phone, and the network is used only to download the handwriting model.
   - **Data safety**: no data collected, no data shared.
   - Content rating, target audience.
5. **Testing tracks**: internal testing, then closed testing (Play requires 12+ testers for 14 days on new personal accounts), then production. Go through [DEVICE-TESTING.md](DEVICE-TESTING.md) before each promotion.

## iOS release (App Store)

1. **Apple account in Xcode**: Xcode → Settings → Accounts → add the developer account (team `H6AS5X74R2`).
2. **Identifiers** (developer.apple.com → Certificates, IDs & Profiles), or let automatic signing create them:
   - App ID `np.nagosi.keyboard` with App Groups and Fonts.
   - App ID `np.nagosi.keyboard.extension` with App Groups.
   - App Group `group.np.nagosi.keyboard`.
3. **Fonts entitlement**: `com.apple.developer.user-fonts` (installing Nagosi for all apps) **needs Apple's approval**. Request it from the Fonts capability on the App ID. Until it is approved, a device build fails with "requires approval from Apple". To test the keyboard on a device meanwhile, build without it:
   ```bash
   xcodebuild -workspace Nagosi.xcworkspace -scheme Nagosi -destination 'generic/platform=iOS' \
     DEVELOPMENT_TEAM=H6AS5X74R2 -allowProvisioningUpdates \
     CODE_SIGN_ENTITLEMENTS=NagosiApp/Nagosi-device-test.entitlements build
   ```
   (In Xcode: set the app target's Code Signing Entitlements to `NagosiApp/Nagosi-device-test.entitlements`.)
   Everything works except the "Install Nagosi fonts" button.
4. **Version**: `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in `ios/project.yml` (both targets must match), then `xcodegen`.
5. **Archive**: open `Nagosi.xcworkspace`, select the Nagosi scheme and "Any iOS Device", then Product → Archive, then Distribute App → App Store Connect. Or from the command line:
   `xcodebuild -workspace Nagosi.xcworkspace -scheme Nagosi -configuration Release -archivePath build/Nagosi.xcarchive archive`.
6. **App Store Connect**:
   - **Privacy**: "Data Not Collected". `ios/Shared/PrivacyInfo.xcprivacy` declares no tracking, no collected data, and UserDefaults for reasons CA92.1 and 1C8F.1. The ML Kit pods ship their own manifests.
   - **Review notes**: Full Access is requested only to download the on-device handwriting model once. Typing works without it, and no keystrokes are sent anywhere. This is App Review guideline 4.4.1, and they ask.
   - Screenshots of each keyboard on iPhone and iPad.
7. **TestFlight**: internal testers first. Go through [DEVICE-TESTING.md](DEVICE-TESTING.md), then submit for review.

## Known limits

- iOS keyboard extensions get roughly 50–70 MB of memory, and ML Kit handwriting is the heaviest part. Measure it on a real phone (Xcode → Debug Navigator → Memory while ✍ is open) before release.
- ML Kit may not have a Sanskrit model. The pad then falls back to the Hindi Devanagari model, which recognises the same letters but not Vedic marks.
- 卐 is not drawn by Nagosi; the system font draws it.
- Some corner letters on the Vedic keys (ᳵ on x, ꣳ, ᳲ) and the traditional ह्न and हृ follow the screenshots as closely as could be read. Confirm them with a Vedic reader.
