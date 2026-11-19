# Nagosi keyboard for iOS

- `NagosiEngine/`: Swift package, a port of `engine/` (TypeScript reference). `swift test` checks it against `tests/vectors`.
- `NagosiKeyboard/`: the keyboard extension. Composing text is inline marked text. It needs no Full Access and no network.
- `NagosiApp/`: the container app. It explains setup, has a test field, and installs the Nagosi fonts
  for **all apps** (Pages, Keynote, Notes…) through `CTFontManagerRegisterFontURLs(.persistent)`. That
  needs the `com.apple.developer.user-fonts` entitlement (`system-installation`), already in
  `Nagosi.entitlements`; enable it for the App ID in the developer portal.

```bash
cd ios
./scripts/sync-resources.sh      # copy schemes, dictionaries and fonts from the repo
brew install xcodegen && xcodegen # generates Nagosi.xcodeproj from project.yml
open Nagosi.xcodeproj
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

Handwriting on iOS needs ML Kit from CocoaPods (`ios/Podfile`):
`./scripts/sync-resources.sh && xcodegen && pod install && open Nagosi.xcworkspace`. A keyboard can
only download the model with **Full Access**, so the extension now asks for it (`RequestsOpenAccess`);
typing itself never uses the network. Without the pod, the ✍ pad opens and says ML Kit is missing.
The ML Kit calls are written against its documented API but have not been compiled here.

Status: the engine package passes its tests. The extension and the app type-check against the
iOS 16 SDK. They have not run on a device or simulator yet.
