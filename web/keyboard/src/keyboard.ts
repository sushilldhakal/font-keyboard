/**
 * On-screen keyboard for NagosiInput.
 *
 * - roman: QWERTY keys labelled with the Devanagari each one types. Hold a key for the related
 *   letters (hold d for द ध ड ढ, hold a for आ), so retroflex letters, long vowels and ष are one
 *   press away without learning capitals.
 * - letters: every Devanagari letter and sign on its own key, typed as is. Two pages: consonants
 *   with vowel signs, then vowels, digits and Sanskrit signs. Suggestions follow the word at the caret.
 * - inscript: the standard INSCRIPT layout.
 *
 * The 'कख' / 'abc' key switches between the romanized keys and the letter keys.
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

/** Long-press choices on a roman key: [label, roman keys it types]. Shared with Android and iOS. */
export const ROMAN_MORE: Record<string, [string, string][]> = {
  a: [["आ ा", "aa"]], i: [["ई ी", "ii"]], u: [["ऊ ू", "uu"]], e: [["ऐ ै", "ai"]], o: [["औ ौ", "au"]],
  r: [["ऋ ृ", "R"]],
  d: [["ध", "dh"], ["ड", "D"], ["ढ", "Dh"]],
  t: [["थ", "th"], ["ट", "T"], ["ठ", "Th"]],
  n: [["ण", "N"], ["ङ", "ng"], ["ञ", "yn"], ["ं", "M"], ["ँ", "~"]],
  s: [["श", "sh"], ["ष", "Sh"], ["क्ष", "ksh"]],
  c: [["छ", "chh"]],
  k: [["ख", "kh"], ["क्ष", "ksh"]],
  g: [["घ", "gh"], ["ज्ञ", "gy"]],
  j: [["झ", "jh"], ["ज्ञ", "gy"]],
  p: [["फ", "ph"]],
  b: [["भ", "bh"], ["व", "w"]],
  h: [["ः", "H"], ["्", "_"]],
  m: [["ं", "M"], ["ँ", "~"]],
  l: [["ळ", "L"]],
  y: [["ञ", "yn"]],
};

/** Letter keyboard pages. Each key types its label. */
export const LETTER_PAGES: string[][][] = [
  [
    ["ा", "ि", "ी", "ु", "ू", "ृ", "े", "ै", "ो", "ौ"],
    ["क", "ख", "ग", "घ", "ङ", "च", "छ", "ज", "झ", "ञ"],
    ["ट", "ठ", "ड", "ढ", "ण", "त", "थ", "द", "ध", "न"],
    ["प", "फ", "ब", "भ", "म", "य", "र", "ल", "व", "श"],
    ["ष", "स", "ह", "क्ष", "त्र", "ज्ञ", "्", "ं", "ँ"],
  ],
  [
    ["अ", "आ", "इ", "ई", "उ", "ऊ", "ऋ", "ए", "ऐ", "ओ"],
    ["औ", "अं", "अः", "ः", "ऽ", "ॐ", "।", "॥", "ॠ", "ळ"],
    ["१", "२", "३", "४", "५", "६", "७", "८", "९", "०"],
    ["श्र", "द्ध", "द्य", "द्व", "ह्म", "ट्ट", "र्", "़", "ॄ", "?"],
    [",", ".", "!", "-", "(", ")", "\"", "'", "/"],
  ],
];

export type KeyboardLayout = "roman" | "inscript" | "letters";

export interface KeyboardOptions {
  layout?: KeyboardLayout;
  /** Milliseconds to hold a key before its extra letters open (default 380). */
  holdDelay?: number;
}

export class OnScreenKeyboard {
  readonly root: HTMLElement;
  private input: NagosiInput;
  private shift = false;
  private layout: KeyboardLayout;
  /** The romanized layout to return to from the letter keys. */
  private typing: "roman" | "inscript";
  private page = 0;
  private holdDelay: number;
  private popup: HTMLElement | null = null;

  constructor(container: HTMLElement, input: NagosiInput, opts: KeyboardOptions = {}) {
    this.input = input;
    this.layout = opts.layout ?? "roman";
    this.typing = this.layout === "inscript" ? "inscript" : "roman";
    this.holdDelay = opts.holdDelay ?? 380;
    this.root = document.createElement("div");
    this.root.className = "nagosi-kbd";
    this.root.setAttribute("role", "group");
    this.root.setAttribute("aria-label", "On-screen Nepali keyboard");
    container.append(this.root);
    this.render();
  }

  get currentLayout(): KeyboardLayout {
    return this.layout;
  }

  setLayout(layout: KeyboardLayout): void {
    this.layout = layout;
    if (layout !== "letters") this.typing = layout;
    this.page = 0;
    this.shift = false;
    this.render();
  }

  private rows(): string[][] {
    if (this.layout === "letters") return LETTER_PAGES[this.page];
    if (this.layout === "inscript") return layouts.inscript.rows;
    return QWERTY;
  }

  private label(k: string): string {
    if (this.layout === "letters") return k;
    if (this.layout === "inscript") {
      const key = this.shift ? layouts.inscript.shiftOf[k] ?? k : k;
      return layouts.inscript.keys[key] ?? key;
    }
    if (/[0-9]/.test(k)) return "०१२३४५६७८९"[+k];
    return ROMAN_HINT[this.shift ? k.toUpperCase() : k] ?? k;
  }

  private char(k: string): string {
    if (this.layout === "letters") return k;
    if (this.layout === "inscript") return this.shift ? layouts.inscript.shiftOf[k] ?? k : k;
    return this.shift ? k.toUpperCase() : k;
  }

  private typeRoman(keys: string) {
    for (const c of keys) this.input.key(c);
  }

  private closePopup() {
    this.popup?.remove();
    this.popup = null;
  }

  private openPopup(anchor: HTMLElement, choices: [string, string][]) {
    this.closePopup();
    const pop = document.createElement("div");
    pop.className = "nagosi-pop";
    pop.setAttribute("role", "menu");
    for (const [label, keys] of choices) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "nagosi-key";
      b.setAttribute("role", "menuitem");
      b.setAttribute("aria-label", `${label} (${keys})`);
      b.innerHTML = "";
      const m = document.createElement("span");
      m.className = "nagosi-key-main";
      m.textContent = label;
      const s = document.createElement("span");
      s.className = "nagosi-key-sub";
      s.textContent = keys;
      b.append(m, s);
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", () => {
        this.input.el.focus();
        this.typeRoman(keys);
        this.closePopup();
      });
      pop.append(b);
    }
    this.root.append(pop);
    const r = anchor.getBoundingClientRect();
    const box = this.root.getBoundingClientRect();
    pop.style.left = Math.max(0, Math.min(r.left - box.left, box.width - pop.offsetWidth)) + "px";
    pop.style.top = Math.max(0, r.top - box.top - pop.offsetHeight - 4) + "px";
    this.popup = pop;
  }

  private button(text: string, cls: string, aria: string, onPress: () => void, sub?: string, more?: [string, string][]): HTMLButtonElement {
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
    if (more?.length) {
      b.classList.add("has-more");
      b.title = "Hold for " + more.map(([l]) => l).join(" ");
    }
    let timer = 0;
    let held = false;
    b.addEventListener("mousedown", (e) => e.preventDefault()); // keep the caret in the field
    if (more?.length) {
      b.addEventListener("pointerdown", () => {
        held = false;
        clearTimeout(timer);
        timer = window.setTimeout(() => {
          held = true;
          this.openPopup(b, more);
        }, this.holdDelay);
      });
      for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, () => clearTimeout(timer));
      b.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        held = true;
        this.openPopup(b, more);
      });
    }
    b.addEventListener("click", () => {
      if (held) {
        held = false;
        return;
      }
      this.closePopup();
      this.input.el.focus();
      onPress();
    });
    return b;
  }

  private render(): void {
    this.closePopup();
    this.root.replaceChildren();
    this.root.dataset.layout = this.layout;
    const rows = this.rows();
    for (const [ri, row] of rows.entries()) {
      const r = document.createElement("div");
      r.className = "nagosi-row";
      const last = ri === rows.length - 1;
      if (last && this.layout !== "letters") {
        r.append(this.button("⇧", "wide" + (this.shift ? " on" : ""), "Shift", () => { this.shift = !this.shift; this.render(); }));
      }
      for (const k of row) {
        const ch = this.char(k);
        const lbl = this.label(k);
        if (this.layout === "letters") {
          r.append(this.button(lbl, "", lbl, () => this.input.insert(ch)));
          continue;
        }
        const more = this.layout === "roman" && !this.shift ? ROMAN_MORE[k] : undefined;
        r.append(this.button(lbl, "", `${lbl} (${ch})`, () => {
          this.input.key(ch);
          if (this.shift) { this.shift = false; this.render(); }
        }, ch, more));
      }
      if (last) r.append(this.button("⌫", "wide", "Backspace", () => this.input.backspace()));
      this.root.append(r);
    }
    const bottom = document.createElement("div");
    bottom.className = "nagosi-row";
    if (this.layout === "letters") {
      bottom.append(
        this.button("abc", "wide", "Romanized keys", () => this.setLayout(this.typing)),
        this.button(this.page === 0 ? "अ१" : "कख", "wide", this.page === 0 ? "Vowels and digits" : "Consonants", () => { this.page = 1 - this.page; this.render(); }),
        this.button("space", "space", "Space", () => this.input.insert(" ")),
        this.button("↵", "wide", "Enter", () => this.input.insert("\n")),
      );
    } else {
      bottom.append(
        this.button("कख", "wide", "Devanagari letter keys", () => this.setLayout("letters")),
        this.button("।", "", "Danda", () => this.input.key(this.layout === "inscript" ? ">" : "|")),
        this.button("space", "space", "Space", () => this.input.key(" ")),
        this.button("↵", "wide", "Enter", () => this.input.key("\n")),
      );
    }
    this.root.append(bottom);
  }
}
