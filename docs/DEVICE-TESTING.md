# Device testing checklist

Run this on real phones before every Play or App Store promotion. The automated tests prove the
engine and the font; only a device proves the keyboard. Note the device, OS version and build, and tick each line.

Devices to cover, at least:
- **Android**: one small screen (≤ 5.5″) on Android 7–9, and one current phone on Android 14–15.
- **iOS**: one iPhone on the oldest supported iOS (16), one current iPhone, and one iPad.

## Install

- Android: `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`, or the internal-testing track.
- iOS: TestFlight, or Xcode Run on the device (see PRODUCTION.md for the device-test entitlements).

## Setup and settings

- [ ] App opens. "Open keyboard settings" / "Open Settings" goes to the right place.
- [ ] Vedic Nepali can be enabled and chosen (Android: input-method picker; iOS: 🌐 long-press).
- [ ] Picking a keyboard in the app opens that keyboard the next time a text field is tapped.
- [ ] Turning off "Space picks the best word" makes `dhakal␣` stay धकल. Turning it on gives ढकाल.
- [ ] "Forget learned words" removes a word you picked earlier from the suggestions.

## नेपाली (traditional, direct Nepali)

- [ ] Tap gives the big letter, hold gives the corner letter (ढ from the ड key, ज्ञ from ज, क्ष from क).
- [ ] Type ढकाल, नेपाल, तपाईं, श्रीमान्, क्षेत्र. The text looks right in Notes/Keep, Messages and a browser field.
- [ ] १२३ gives Devanagari digits. । and ॥ work.

## नेपाली (Roman, transliteration and suggestions)

- [ ] `dhakal`, `nepal`, `tapai`, `sushil`, `kaha` give ढकाल नेपाल तपाईं सुशील कहाँ when you press space.
- [ ] Backspace right after an automatic pick puts back what you typed.
- [ ] Suggestions update on every key. Tapping one replaces the word.
- [ ] Holding `d` offers ध ड ढ.
- [ ] A word picked twice moves to the top of the suggestions, and still does after the keyboard is closed and reopened.

## वैदिक (direct Sanskrit with Vedic marks)

- [ ] ⇧ turns the vowel keys into signs. Type गि॒रा॑, अ॒ग्निमी॑ळे.
- [ ] ᳚ ᳛ ꣳ ᳲ ३ ऽ ॐ insert and draw (in Vedic Nepali; other fonts may show boxes, which is a font matter, not input).
- [ ] Sanskrit (IAST): `saṃskṛtam` gives संस्कृतम्.

## ✍ Handwriting

- [ ] The first open shows "downloading". With no network (or iOS without Full Access) it shows the message saying why.
- [ ] After the download, airplane mode: still recognises.
- [ ] Write नमस्ते: the candidates appear, tapping one inserts it, and space takes the first.
- [ ] iOS: memory stays under the limit (Xcode → Debug Navigator → Memory, attached to the extension). The keyboard must not close itself while writing.

## Everywhere

- [ ] ‹ › on the space bar, and a swipe on it, go through the four keyboards. The label reads in full (वैदिक, not वादक).
- [ ] Dark mode, landscape, and an iPad's floating and split keyboards.
- [ ] Password fields: the system keyboard takes over (iOS), or no suggestions are learned (Android).
- [ ] A hardware keyboard types roman into the composer (Android).
- [ ] Switch to the system keyboard and back. Nothing is lost mid-word.
- [ ] Copy text typed with Vedic Nepali to a desktop. It is plain Devanagari: search finds it, and other fonts display it.
