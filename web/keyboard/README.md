# @nagosi/keyboard

Nepali and Sanskrit typing for any `<textarea>` or `<input>`.

```js
import { NagosiInput, OnScreenKeyboard, Speller, Suggester } from "@nagosi/keyboard";
import "@nagosi/keyboard/keyboard.css";
import ne from "@nagosi/engine/dictionaries/ne.json";
import bigrams from "@nagosi/engine/dictionaries/bigrams.json";

const field = document.querySelector("textarea");
const input = new NagosiInput(field, {
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
- On-screen keyboard: hold a key for related letters (hold `d` for ध ड ढ, `a` for आ, `s` for श ष).
  The **कख** key opens the Devanagari letter keys: every letter, vowel sign and digit on its own key,
  typed as is, with suggestions for the word at the caret. `input.insert(text)` does the same from your own UI.
- Phone keyboards that compose Latin words (Gboard, SwiftKey) are converted word by word.
  For full-time phone typing use the Nagosi Android and iOS keyboards.
- Set `font-family: "Nagosi"` on the field (see `cdn/`) so conjuncts render in the classical style.
