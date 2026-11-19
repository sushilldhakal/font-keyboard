# @nagosi/keyboard

Nepali and Sanskrit typing for any `<textarea>` or `<input>`.

```js
import { NagosiInput, OnScreenKeyboard, Suggester } from "@nagosi/keyboard";
import "@nagosi/keyboard/keyboard.css";
import ne from "@nagosi/engine/dictionaries/ne.json";

const field = document.querySelector("textarea");
const input = new NagosiInput(field, {
  scheme: "nepali-roman",            // "iast" | "itrans" | "harvard-kyoto" | "inscript" | "off"
  suggester: new Suggester(ne),
  onChange: ({ composing, suggestions }) => render(suggestions), // show a suggestion bar
});
new OnScreenKeyboard(document.querySelector("#kbd"), input);   // optional
```

- Physical keyboards: each roman key updates the composing word inline (`namast` → नमस्त → `namaste` → नमस्ते).
  Backspace removes the last roman key. Space, Enter or punctuation commits. Tab takes the first suggestion.
- Phone keyboards that compose Latin words (Gboard, SwiftKey) are converted word by word.
  For full-time phone typing use the Nagosi Android and iOS keyboards.
- Set `font-family: "Nagosi"` on the field (see `cdn/`) so conjuncts render in the classical style.
