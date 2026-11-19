/**
 * NagosiInput: turns any <textarea> or <input> into a Nepali/Sanskrit input field.
 *
 * Desktop: intercepts `beforeinput`, keeps the composing word inline and replaces it as each roman
 * key arrives. Phones whose keyboards compose Latin words themselves (Gboard, SwiftKey): converts
 * each word on `compositionend`. Direct layouts (INSCRIPT) map key → letter with no composition.
 */
import { Composer, Suggester, layouts, schemes, transliterate } from "@nagosi/engine";

export type Field = HTMLTextAreaElement | HTMLInputElement;
export type SchemeId = keyof typeof schemes | "inscript" | "off";

export interface InputOptions {
  scheme?: SchemeId;
  suggester?: Suggester;
  /** Called whenever the composing word or its suggestions change. */
  onChange?: (state: { buffer: string; composing: string; suggestions: string[] }) => void;
  suggestionLimit?: number;
}

export class NagosiInput {
  readonly el: Field;
  private scheme: SchemeId;
  private composer: Composer;
  private start = -1;
  private len = 0;
  private opts: InputOptions;
  private off: (() => void)[] = [];

  constructor(el: Field, opts: InputOptions = {}) {
    this.el = el;
    this.opts = opts;
    this.scheme = opts.scheme ?? "nepali-roman";
    this.composer = new Composer(schemes[this.isRoman(this.scheme) ? this.scheme : "nepali-roman"]);
    el.setAttribute("autocapitalize", "off");
    el.setAttribute("autocorrect", "off");
    el.setAttribute("spellcheck", "false");
    this.on("beforeinput", (e) => this.beforeInput(e as InputEvent));
    this.on("compositionend", (e) => this.compositionEnd(e as CompositionEvent));
    this.on("keydown", (e) => this.keyDown(e as KeyboardEvent));
    this.on("mousedown", () => this.reset());
    this.on("blur", () => this.reset());
  }

  private on(type: string, fn: (e: Event) => void) {
    this.el.addEventListener(type, fn);
    this.off.push(() => this.el.removeEventListener(type, fn));
  }

  private isRoman(id: SchemeId): id is keyof typeof schemes {
    return id in schemes;
  }

  detach(): void {
    this.reset();
    this.off.forEach((f) => f());
  }

  get schemeId(): SchemeId {
    return this.scheme;
  }

  setScheme(id: SchemeId): void {
    this.reset();
    this.scheme = id;
    if (this.isRoman(id)) this.composer = new Composer(schemes[id]);
  }

  setSuggester(s: Suggester | undefined): void {
    this.opts.suggester = s;
    this.emit();
  }

  get state() {
    const { buffer, composing } = this.composer.state;
    return { buffer, composing, suggestions: this.suggestions(composing) };
  }

  private suggestions(composing: string): string[] {
    if (!composing || !this.opts.suggester) return [];
    return this.opts.suggester.suggest(composing, { limit: this.opts.suggestionLimit ?? 5 });
  }

  private emit() {
    this.opts.onChange?.(this.state);
  }

  private replace(start: number, end: number, text: string) {
    this.el.setRangeText(text, start, end, "end");
    this.el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /** Forget the composing word (its text stays in the field as typed). */
  reset(): void {
    if (this.start < 0 && !this.composer.state.buffer) return;
    this.composer.flush();
    this.start = -1;
    this.len = 0;
    this.emit();
  }

  /** Type one key, as a physical or on-screen keyboard would. */
  key(ch: string): void {
    const el = this.el;
    if (this.scheme === "off") {
      this.replace(el.selectionStart ?? 0, el.selectionEnd ?? 0, ch);
      return;
    }
    if (this.scheme === "inscript") {
      this.replace(el.selectionStart ?? 0, el.selectionEnd ?? 0, layouts.inscript.keys[ch] ?? ch);
      return;
    }
    if (this.start < 0) {
      if (el.selectionStart !== el.selectionEnd) this.replace(el.selectionStart ?? 0, el.selectionEnd ?? 0, "");
      this.start = el.selectionStart ?? 0;
      this.len = 0;
    }
    const r = this.composer.key(ch);
    if (r.commit) {
      this.replace(this.start, this.start + this.len, r.commit);
      const word = r.commit.replace(/[^ऀ-ॿ]+$/, "");
      if (word) this.opts.suggester?.learn(word);
      this.start = -1;
      this.len = 0;
    } else {
      this.replace(this.start, this.start + this.len, r.composing);
      this.len = r.composing.length;
    }
    this.emit();
  }

  /** Backspace: removes the last roman key while composing, else one character. */
  backspace(): void {
    const el = this.el;
    if (this.start >= 0 && this.composer.backspace()) {
      const c = this.composer.state.composing;
      this.replace(this.start, this.start + this.len, c);
      this.len = c.length;
      if (!this.composer.state.buffer) {
        this.start = -1;
        this.len = 0;
      }
      this.emit();
      return;
    }
    const s = el.selectionStart ?? 0;
    const e = el.selectionEnd ?? 0;
    if (s !== e) this.replace(s, e, "");
    else if (s > 0) {
      // delete one code point (surrogate-pair safe)
      const before = el.value.slice(0, s);
      const n = [...before].pop()!.length;
      this.replace(s - n, s, "");
    }
  }

  /** Replace the composing word with a suggestion. */
  choose(word: string): void {
    if (this.start < 0) return;
    this.replace(this.start, this.start + this.len, this.composer.choose(word));
    this.opts.suggester?.learn(word);
    this.start = -1;
    this.len = 0;
    this.emit();
  }

  private beforeInput(e: InputEvent) {
    if (this.scheme === "off" || e.isComposing || e.inputType.startsWith("insertComposition")) return;
    if (e.inputType === "insertText" && e.data) {
      e.preventDefault();
      for (const ch of e.data) this.key(ch);
    } else if (e.inputType === "insertLineBreak" && this.el instanceof HTMLTextAreaElement) {
      e.preventDefault();
      this.key("\n");
    } else if (e.inputType === "deleteContentBackward" && this.start >= 0) {
      e.preventDefault();
      this.backspace();
    } else if (this.start >= 0) {
      this.reset();
    }
  }

  private compositionEnd(e: CompositionEvent) {
    if (!e.data || !/[A-Za-z]/.test(e.data) || this.scheme === "off") return;
    const end = this.el.selectionStart ?? 0;
    const start = end - e.data.length;
    if (start < 0 || this.el.value.slice(start, end) !== e.data) return;
    const out = this.scheme === "inscript"
      ? [...e.data].map((c) => layouts.inscript.keys[c] ?? c).join("")
      : transliterate(e.data, schemes[this.scheme]);
    this.replace(start, end, out);
  }

  private keyDown(e: KeyboardEvent) {
    if (this.start < 0) return;
    if (e.key === "Tab") {
      const first = this.state.suggestions[0];
      e.preventDefault();
      if (first) this.choose(first);
      else this.key(" ");
    } else if (e.key === "Escape" || e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") {
      this.reset();
    }
  }
}
