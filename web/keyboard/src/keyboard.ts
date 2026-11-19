/**
 * On-screen keyboard for NagosiInput.
 *
 * Several keyboards, switched with the ‹ › arrows on the space bar (or by swiping along it):
 * - नेपाली: the Nepali traditional phone layout (engine/keyboards/nepali-traditional.json). Every key
 *   types its Devanagari letter; hold a key, or press ⇧ first, for the small letter in its corner.
 * - नेपाली (Roman): QWERTY keys typed as Romanized Nepali ("dhakal" → ढकाल). Hold a key for related
 *   letters (d → ध ड ढ).
 * - वैदिक: the Vedic Sanskrit layout (engine/keyboards/vedic.json): vowels, varga-ordered consonants,
 *   svara marks; ⇧ turns the vowels into their signs.
 * - Sanskrit (IAST): QWERTY keys typed as IAST.
 * १२३ opens digits and symbols on the letter keyboards. Suggestions follow the word being typed.
 */
import { keyboards, layouts, type PhoneKey, type PhoneLayout } from "@nagosi/engine";
import type { NagosiInput, SchemeId } from "./input.js";

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

export interface KeyboardChoice {
  /** Keyboard id: a phone layout in engine/keyboards, or a roman scheme. */
  id: string;
  /** Name on the space bar. */
  label: string;
  kind: "phone" | "roman";
  /** Dictionary language for suggestions. */
  lang: "ne" | "sa";
}

/** The keyboards the space bar cycles through, in order. Shared with Android and iOS. */
export const KEYBOARDS: KeyboardChoice[] = [
  { id: "nepali-traditional", label: "नेपाली", kind: "phone", lang: "ne" },
  { id: "nepali-roman", label: "नेपाली (Roman)", kind: "roman", lang: "ne" },
  { id: "vedic", label: "वैदिक", kind: "phone", lang: "sa" },
  { id: "iast", label: "Sanskrit (IAST)", kind: "roman", lang: "sa" },
];

export type KeyboardLayout = string; // a KEYBOARDS id, or "inscript"

export interface KeyboardOptions {
  /** Starting keyboard (a KEYBOARDS id or "inscript"); default नेपाली. */
  layout?: KeyboardLayout;
  /** Milliseconds to hold a key before its second letter (default 380). */
  holdDelay?: number;
  /** Called when the user switches keyboard with the space bar, e.g. to change the dictionary. */
  onSwitch?: (choice: KeyboardChoice) => void;
}

export class OnScreenKeyboard {
  readonly root: HTMLElement;
  private input: NagosiInput;
  private shift = false;
  private layout: KeyboardLayout;
  /** Letter keyboards: 0 letters, 1 digits and symbols. */
  private page = 0;
  private holdDelay: number;
  private popup: HTMLElement | null = null;
  private onSwitch?: (choice: KeyboardChoice) => void;

  constructor(container: HTMLElement, input: NagosiInput, opts: KeyboardOptions = {}) {
    this.input = input;
    this.layout = opts.layout ?? "nepali-traditional";
    this.holdDelay = opts.holdDelay ?? 380;
    this.onSwitch = opts.onSwitch;
    this.root = document.createElement("div");
    this.root.className = "nagosi-kbd";
    this.root.setAttribute("role", "group");
    this.root.setAttribute("aria-label", "On-screen Nepali keyboard");
    container.append(this.root);
    this.applyScheme();
    this.render();
  }

  get currentLayout(): KeyboardLayout {
    return this.layout;
  }

  private get choice(): KeyboardChoice | undefined {
    return KEYBOARDS.find((k) => k.id === this.layout);
  }

  private get phone(): PhoneLayout | undefined {
    return this.choice?.kind === "phone" ? keyboards[this.layout] : undefined;
  }

  /** Show a keyboard without changing the input scheme (the host already set it). */
  setLayout(layout: KeyboardLayout): void {
    this.layout = layout;
    this.page = 0;
    this.shift = false;
    this.render();
  }

  /** Switch keyboard as the space-bar arrows do: also sets the input scheme and tells the host. */
  switchTo(id: string): void {
    this.input.reset();
    this.setLayout(id);
    this.applyScheme();
    const c = this.choice;
    if (c) this.onSwitch?.(c);
  }

  /** Next (+1) or previous (-1) keyboard in KEYBOARDS. */
  cycle(step: 1 | -1): void {
    const i = KEYBOARDS.findIndex((k) => k.id === this.layout);
    this.switchTo(KEYBOARDS[(i + step + KEYBOARDS.length) % KEYBOARDS.length].id);
  }

  private applyScheme() {
    const c = this.choice;
    if (c?.kind === "roman") this.input.setScheme(c.id as SchemeId);
  }

  private label(k: string): string {
    if (this.layout === "inscript") {
      const key = this.shift ? layouts.inscript.shiftOf[k] ?? k : k;
      return layouts.inscript.keys[key] ?? key;
    }
    if (/[0-9]/.test(k)) return "०१२३४५६७८९"[+k];
    if (this.layout === "iast") return this.shift ? k.toUpperCase() : k;
    return ROMAN_HINT[this.shift ? k.toUpperCase() : k] ?? k;
  }

  private char(k: string): string {
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

  /** A letter key: tap types its letter, hold types the corner letter, ⇧ shows the shift letter. */
  private phoneKey([tap, hold, shiftTo]: PhoneKey, cls = ""): HTMLButtonElement {
    const alt = shiftTo || (this.phone?.shift === "explicit" ? "" : hold);
    const shown = this.shift && alt ? alt : tap;
    const corner = this.shift ? (alt ? tap : hold) : hold;
    let fired = false; // the hold already typed the corner letter: ignore the click that follows
    const b = this.button(shown, cls, hold ? `${tap}, hold for ${hold}` : tap, () => {
      if (fired) { fired = false; return; }
      this.input.insert(shown);
      if (this.shift) { this.shift = false; this.render(); }
    }, corner || undefined);
    b.classList.add("phone");
    if (hold) {
      const other = this.shift && alt ? tap : hold;
      const typeOther = () => {
        fired = true;
        this.input.el.focus();
        this.input.insert(other);
        if (this.shift) { this.shift = false; this.render(); }
      };
      let timer = 0;
      b.addEventListener("pointerdown", () => {
        fired = false;
        clearTimeout(timer);
        timer = window.setTimeout(typeOther, this.holdDelay);
      });
      for (const ev of ["pointerup", "pointerleave", "pointercancel"]) b.addEventListener(ev, () => clearTimeout(timer));
      b.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        clearTimeout(timer);
        typeOther();
      });
    }
    return b;
  }

  /** Space bar: ‹ name ›. The arrows (or a swipe along the bar) switch keyboard; the middle types a space. */
  private spaceBar(type: () => void): HTMLButtonElement {
    const c = this.choice;
    if (!c) return this.button("space", "space", "Space", type);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "nagosi-key space switcher";
    b.setAttribute("aria-label", `Space. Keyboard: ${c.label}. Use the arrows to switch.`);
    const prev = document.createElement("span");
    prev.className = "nagosi-arrow prev";
    prev.textContent = "‹";
    prev.setAttribute("role", "button");
    prev.setAttribute("aria-label", "Previous keyboard");
    const name = document.createElement("span");
    name.className = "nagosi-key-main";
    name.textContent = c.label;
    const next = document.createElement("span");
    next.className = "nagosi-arrow next";
    next.textContent = "›";
    next.setAttribute("role", "button");
    next.setAttribute("aria-label", "Next keyboard");
    b.append(prev, name, next);
    let startX = 0;
    let swiped = false;
    b.addEventListener("mousedown", (e) => e.preventDefault());
    b.addEventListener("pointerdown", (e) => { startX = e.clientX; swiped = false; });
    b.addEventListener("pointerup", (e) => {
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 40) { swiped = true; this.cycle(dx > 0 ? -1 : 1); }
    });
    b.addEventListener("click", (e) => {
      if (swiped) { swiped = false; return; }
      this.input.el.focus();
      const t = e.target as HTMLElement;
      if (t.classList.contains("prev")) return this.cycle(-1);
      if (t.classList.contains("next")) return this.cycle(1);
      type();
    });
    return b;
  }

  private renderPhone(layout: PhoneLayout): void {
    const rows = this.page === 0 ? layout.rows : layout.numbers;
    rows.forEach((row, ri) => {
      const r = document.createElement("div");
      r.className = "nagosi-row";
      const last = ri === rows.length - 1;
      if (last && this.page === 0) {
        r.append(this.button("⇧", "wide" + (this.shift ? " on" : ""), "Shift: second letters", () => { this.shift = !this.shift; this.render(); }));
      }
      for (const k of row) r.append(this.phoneKey(k));
      if (last) r.append(this.button("⌫", "wide", "Backspace", () => this.input.backspace()));
      this.root.append(r);
    });
    const bottom = document.createElement("div");
    bottom.className = "nagosi-row";
    const [left, danda] = layout.bottom;
    bottom.append(
      this.button(this.page === 0 ? "१२३" : "कख", "wide", this.page === 0 ? "Digits and symbols" : "Letters", () => { this.page = 1 - this.page; this.shift = false; this.render(); }),
      this.phoneKey(left),
      this.spaceBar(() => this.input.insert(" ")),
      this.phoneKey(danda),
      this.button("↵", "wide", "Enter", () => this.input.insert("\n")),
    );
    this.root.append(bottom);
  }

  private render(): void {
    this.closePopup();
    this.root.replaceChildren();
    this.root.dataset.layout = this.layout;
    const phone = this.phone;
    this.root.dataset.kind = phone ? "phone" : "roman";
    if (phone) {
      this.renderPhone(phone);
      return;
    }
    const rows = this.layout === "inscript" ? layouts.inscript.rows : QWERTY;
    for (const [ri, row] of rows.entries()) {
      const r = document.createElement("div");
      r.className = "nagosi-row";
      const last = ri === rows.length - 1;
      if (last) {
        r.append(this.button("⇧", "wide" + (this.shift ? " on" : ""), "Shift", () => { this.shift = !this.shift; this.render(); }));
      }
      for (const k of row) {
        const ch = this.char(k);
        const lbl = this.label(k);
        const more = this.layout === "nepali-roman" && !this.shift ? ROMAN_MORE[k] : undefined;
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
    bottom.append(
      this.button(",", "", "Comma", () => this.input.key(",")),
      this.spaceBar(() => this.input.key(" ")),
      this.button("।", "", "Danda", () => this.input.key(this.layout === "inscript" ? ">" : "|")),
      this.button("↵", "wide", "Enter", () => this.input.key("\n")),
    );
    this.root.append(bottom);
  }
}
