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

Typing: type as it sounds (`dhakal`) and Space commits the dictionary word (ढकाल); Backspace right
after restores what you typed. Hold a key for related letters (`d` → ध ड ढ). **कख** opens the
Devanagari letter keys (two pages), **abc** goes back.

Status: the engine package passes its tests. The extension and the app type-check against the
iOS 16 SDK. They have not run on a device or simulator yet.
