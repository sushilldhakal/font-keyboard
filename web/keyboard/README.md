# @vedicnepali/keyboard

Nepali and Sanskrit typing for any `<textarea>` or `<input>`.

```js
import { VedicNepaliInput, OnScreenKeyboard, Speller, Suggester } from "@vedicnepali/keyboard";
import "@vedicnepali/keyboard/keyboard.css";
import ne from "@vedicnepali/engine/dictionaries/ne.json";
import bigrams from "@vedicnepali/engine/dictionaries/bigrams.json";

const field = document.querySelector("textarea");
const input = new VedicNepaliInput(field, {
  scheme: "nepali-roman",            // "iast" | "itrans" | "harvard-kyoto" | "inscript" | "off"
  suggester: new Suggester(ne),
  speller: new Speller(bigrams),     // spelling variants for loosely typed words
  onChange: ({ composing, suggestions }) => render(suggestions), // show a suggestion bar
});
new OnScreenKeyboard(document.querySelector("#kbd"), input);   // optional
```

- Type the way words sound. `dhakal` shows धकल while typing, the candidate bar offers ढकाल first, and
  Space commits ढकाल. A Backspace straight after Space puts back what you typed (धकल), and the next
  Space keeps it. Words typed with a capital (`Dhakaal`, `T D N Sh`) are taken exactly as typed.
  Turn the automatic pick off with `autoPick: false`.
- Physical keyboards: each roman key updates the composing word inline (`namast` → नमस्त → `namaste` → नमस्ते).
  Backspace removes the last roman key. Space, Enter or punctuation commits. Tab takes the first suggestion.
- On-screen keyboard: opens on the **Nepali traditional** keys (`engine/keyboards/nepali-traditional.json`).
  Every key types its Devanagari letter; hold a key, or press ⇧ first, for the small letter in its
  corner (क → क्ष, ि → ी); १२३ opens digits; suggestions follow the word at the caret. **abc** switches
  to the romanized keys, where holding a key gives related letters (`d` → ध ड ढ). `input.insert(text)`
  types Devanagari directly from your own UI.
- Phone keyboards that compose Latin words (Gboard, SwiftKey) are converted word by word.
  For full-time phone typing use the Vedic Nepali Android and iOS keyboards.
- Set `font-family: "Vedic Nepali"` on the field (see `cdn/`) so conjuncts render in the classical style.
