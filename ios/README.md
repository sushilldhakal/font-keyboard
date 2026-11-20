# Vedic Nepali keyboard for iOS

- `VedicNepaliEngine/`: Swift package, a port of `engine/` (TypeScript reference). `swift test` checks it against `tests/vectors`.
- `VedicNepaliKeyboard/`: the keyboard extension. Composing text is inline marked text. It needs no Full Access and no network.
- `VedicNepaliApp/`: the container app. It explains setup, has a test field, and installs the Vedic Nepali fonts
  for **all apps** (Pages, Keynote, Notes…) through `CTFontManagerRegisterFontURLs(.persistent)`. That
  needs the `com.apple.developer.user-fonts` entitlement (`system-installation`), already in
  `VedicNepali.entitlements`; enable it for the App ID in the developer portal.

```bash
cd ios
./scripts/sync-resources.sh      # copy schemes, dictionaries and fonts from the repo
brew install xcodegen && xcodegen # generates VedicNepali.xcodeproj from project.yml
open VedicNepali.xcodeproj
```

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

Handwriting on iOS needs ML Kit from CocoaPods (`ios/Podfile`, ML Kit Digital Ink 6.0.0):

```bash
brew install xcodegen cocoapods
cd ios && ./scripts/sync-resources.sh && xcodegen
LANG=en_US.UTF-8 pod install     # CocoaPods fails without a UTF-8 locale
open VedicNepali.xcworkspace
```
 A keyboard can
only download the model with **Full Access**, so the extension now asks for it (`RequestsOpenAccess`);
typing itself never uses the network. Without the pod, the ✍ pad opens and says ML Kit is missing.
With the pods, the app and the keyboard extension build for the simulator
(`xcodebuild -workspace VedicNepali.xcworkspace -scheme Vedic Nepali -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO build`).
Not yet run on a device: watch the extension's memory while handwriting, since iOS limits keyboards
to roughly 50–70 MB.

Settings (keyboard, Space picks the best word, forget learned words) live in the app and reach the
keyboard through the App Group `group.np.vedicnepali.keyboard` (`Shared/VedicNepaliSettings.swift`). Learned
words are saved there too, so they survive iOS ending the extension.

Device builds need an Apple account in Xcode. The font-install entitlement also needs Apple's approval
first; until then, use `VedicNepaliApp/VedicNepali-device-test.entitlements`. See
[docs/PRODUCTION.md](../docs/PRODUCTION.md).

Status: the engine package passes its tests, and the app and extension build for the simulator with
ML Kit. Not run on a device yet.
