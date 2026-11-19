/**
 * On-screen keyboard for NagosiInput. Each key shows the roman key and the Devanagari it
 * produces in the current layout, so people learning romanized typing can see the mapping.
 */
import { layouts } from "@nagosi/engine";
import type { NagosiInput } from "./input.js";

const QWERTY = [
  ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];

// What a single roman key produces on its own in Romanized Nepali (labels only).
const ROMAN_HINT: Record<string, string> = {
  q: "क़", w: "व", e: "े", r: "र", t: "त", y: "य", u: "ु", i: "ि", o: "ो", p: "प",
  a: "ा", s: "स", d: "द", f: "फ", g: "ग", h: "ह", j: "ज", k: "क", l: "ल",
  z: "ज़", x: "क्ष", c: "च", v: "व", b: "ब", n: "न", m: "म",
  Q: "क़", W: "व", E: "ै", R: "ृ", T: "ट", Y: "य", U: "ू", I: "ी", O: "ौ", P: "प",
  A: "ा", S: "श", D: "ड", F: "फ", G: "ग", H: "ः", J: "ज", K: "क", L: "ळ",
  Z: "ज़", X: "क्ष", C: "छ", V: "व", B: "ब", N: "ण", M: "ं",
};

export interface KeyboardOptions {
  layout?: "roman" | "inscript";
}

export class OnScreenKeyboard {
  readonly root: HTMLElement;
  private input: NagosiInput;
  private shift = false;
  private layout: "roman" | "inscript";

  constructor(container: HTMLElement, input: NagosiInput, opts: KeyboardOptions = {}) {
    this.input = input;
    this.layout = opts.layout ?? "roman";
    this.root = document.createElement("div");
    this.root.className = "nagosi-kbd";
    this.root.setAttribute("role", "group");
    this.root.setAttribute("aria-label", "On-screen Nepali keyboard");
    container.append(this.root);
    this.render();
  }

  setLayout(layout: "roman" | "inscript"): void {
    this.layout = layout;
    this.render();
  }

  private rows(): string[][] {
    if (this.layout === "inscript") return layouts.inscript.rows;
    return QWERTY;
  }

  private label(k: string): string {
    if (this.layout === "inscript") {
      const key = this.shift ? layouts.inscript.shiftOf[k] ?? k : k;
      return layouts.inscript.keys[key] ?? key;
    }
    if (/[0-9]/.test(k)) return "०१२३४५६७८९"[+k];
    return ROMAN_HINT[this.shift ? k.toUpperCase() : k] ?? k;
  }

  private char(k: string): string {
    if (this.layout === "inscript") return this.shift ? layouts.inscript.shiftOf[k] ?? k : k;
    return this.shift ? k.toUpperCase() : k;
  }

  private button(text: string, cls: string, aria: string, onPress: () => void, sub?: string): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "nagosi-key " + cls;
    b.setAttribute("aria-label", aria);
    const main = document.createElement("span");
    main.className = "nagosi-key-main";
    main.textContent = text;
    b.append(main);
    if (sub) {
      const s = document.createElement("span");
      s.className = "nagosi-key-sub";
      s.textContent = sub;
      b.append(s);
    }
    b.addEventListener("mousedown", (e) => e.preventDefault()); // keep the caret in the field
    b.addEventListener("click", () => {
      this.input.el.focus();
      onPress();
    });
    return b;
  }

  private render(): void {
    this.root.replaceChildren();
    for (const [ri, row] of this.rows().entries()) {
      const r = document.createElement("div");
      r.className = "nagosi-row";
      if (ri === this.rows().length - 1) {
        r.append(this.button("⇧", "wide" + (this.shift ? " on" : ""), "Shift", () => { this.shift = !this.shift; this.render(); }));
      }
      for (const k of row) {
        const ch = this.char(k);
        r.append(this.button(this.label(k), "", `${this.label(k)} (${ch})`, () => {
          this.input.key(ch);
          if (this.shift) { this.shift = false; this.render(); }
        }, ch));
      }
      if (ri === this.rows().length - 1) r.append(this.button("⌫", "wide", "Backspace", () => this.input.backspace()));
      this.root.append(r);
    }
    const last = document.createElement("div");
    last.className = "nagosi-row";
    last.append(
      this.button("।", "", "Danda", () => this.input.key(this.layout === "inscript" ? ">" : "|")),
      this.button("space", "space", "Space", () => this.input.key(" ")),
      this.button("↵", "wide", "Enter", () => this.input.key("\n")),
    );
    this.root.append(last);
  }
}
