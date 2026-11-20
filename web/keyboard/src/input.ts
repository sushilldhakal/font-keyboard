/**
 * VedicNepaliInput: turns any <textarea> or <input> into a Nepali/Sanskrit input field.
 *
 * Desktop: intercepts `beforeinput`, keeps the composing word inline and replaces it as each roman
 * key arrives. Space commits the best dictionary word for loosely typed Romanized Nepali
 * ("dhakal" → ढकाल); Backspace straight after puts the typed word back. Phones whose keyboards
 * compose Latin words themselves (Gboard, SwiftKey): converts each word on `compositionend`.
 * Direct layouts (INSCRIPT, and the on-screen letter keyboard through `insert`) type letters as is.
 */
import {
  COMMIT_KEYS, Composer, Speller, Suggester, candidates, commitWord, layouts, schemes, transliterate,
} from "@vedicnepali/engine";

export type Field = HTMLTextAreaElement | HTMLInputElement;
export type SchemeId = keyof typeof schemes | "inscript" | "off";

export interface InputState {
  /** Roman keys typed for the current word ("" when typing letters directly). */
  buffer: string;
  /** The word being typed, in Devanagari. */
  composing: string;
  /** Candidate words for it, best first. */
  suggestions: string[];
}

export interface InputOptions {
  scheme?: SchemeId;
  suggester?: Suggester;
  /** Ranks spelling variants of loosely typed Romanized Nepali (data: dictionaries/bigrams.json). */
  speller?: Speller;
  /** Space commits the best dictionary word instead of the strict transliteration (default true). */
  autoPick?: boolean;
  /** Called whenever the composing word or its suggestions change. */
  onChange?: (state: InputState) => void;
  suggestionLimit?: number;
}

const DEVANAGARI_RUN = /[ऀ-ॣॱ-ॿ‌‍]+$/;

export class VedicNepaliInput {
  readonly el: Field;
  private scheme: SchemeId;
  private composer: Composer;
  private start = -1;
  private len = 0;
  private opts: InputOptions;
  private off: (() => void)[] = [];
  /** Last automatic pick, so an immediate Backspace can undo it. */
  private auto: { start: number; text: string; roman: string } | null = null;
  /** After an undo, the next commit keeps the strict spelling. */
  private keepStrict = false;
  /** Letters are being typed directly (on-screen letter keyboard): suggest for the word at the caret. */
  private direct = false;

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

  setSpeller(s: Speller | undefined): void {
    this.opts.speller = s;
    this.emit();
  }

  get state(): InputState {
    const { buffer, composing } = this.composer.state;
    if (!buffer && this.direct) {
      const word = this.directWord();
      return { buffer: "", composing: word, suggestions: this.directSuggestions(word) };
    }
    return { buffer, composing, suggestions: this.suggestions(buffer, composing) };
  }

  private get limit() {
    return this.opts.suggestionLimit ?? 6;
  }

  private get romanScheme() {
    return schemes[this.isRoman(this.scheme) ? this.scheme : "nepali-roman"];
  }

  private suggestions(buffer: string, composing: string): string[] {
    if (!composing) return [];
    return candidates(buffer, composing, this.romanScheme, this.opts.suggester, this.opts.speller, this.limit);
  }

  /** Letters typed directly are exact: words that start with exactly those letters come first. */
  private directSuggestions(word: string): string[] {
    if (!word || !this.opts.suggester) return [];
    const found = this.opts.suggester.suggest(word, { limit: 40 });
    const exact = found.filter((w) => w.startsWith(word) && w !== word);
    return [...exact, ...found.filter((w) => !exact.includes(w))].slice(0, this.limit);
  }

  private directWord(): string {
    const before = this.el.value.slice(0, this.el.selectionStart ?? 0);
    return before.match(DEVANAGARI_RUN)?.[0] ?? "";
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
    this.auto = null;
    this.keepStrict = false;
    this.direct = false;
    if (this.start < 0 && !this.composer.state.buffer) return;
    this.composer.flush();
    this.start = -1;
    this.len = 0;
    this.emit();
  }

  /** Type one key, as a physical or on-screen keyboard would. */
  key(ch: string): void {
    const el = this.el;
    this.auto = null;
    this.direct = false;
    if (this.scheme === "off") {
      this.replace(el.selectionStart ?? 0, el.selectionEnd ?? 0, ch);
      return;
    }
    if (this.scheme === "inscript") {
      this.replace(el.selectionStart ?? 0, el.selectionEnd ?? 0, layouts.inscript.keys[ch] ?? ch);
      return;
    }
    if (this.start < 0) {
      if (COMMIT_KEYS.has(ch)) {
        this.replace(el.selectionStart ?? 0, el.selectionEnd ?? 0, ch);
        return;
      }
      if (el.selectionStart !== el.selectionEnd) this.replace(el.selectionStart ?? 0, el.selectionEnd ?? 0, "");
      this.start = el.selectionStart ?? 0;
      this.len = 0;
    }
    if (COMMIT_KEYS.has(ch)) {
      const { buffer, composing } = this.composer.state;
      const pick = this.opts.autoPick === false || this.keepStrict
        ? composing
        : commitWord(buffer, composing, this.romanScheme, this.opts.suggester, this.opts.speller);
      this.composer.key(ch);
      const text = pick + ch;
      this.replace(this.start, this.start + this.len, text);
      if (pick !== composing) this.auto = { start: this.start, text, roman: buffer };
      else if (pick) this.opts.suggester?.learn(pick);
      this.keepStrict = false;
      this.start = -1;
      this.len = 0;
    } else {
      const r = this.composer.key(ch);
      this.replace(this.start, this.start + this.len, r.composing);
      this.len = r.composing.length;
    }
    this.emit();
  }

  /** Insert Devanagari directly (on-screen letter keyboard). Suggestions follow the word at the caret. */
  insert(text: string): void {
    if (this.start >= 0) this.reset();
    this.auto = null;
    const el = this.el;
    this.replace(el.selectionStart ?? 0, el.selectionEnd ?? 0, text);
    this.direct = /[ऀ-ॿ]/.test(text);
    this.emit();
  }

  /** Backspace: undoes an automatic pick, else removes the last roman key while composing, else one character. */
  backspace(): void {
    const el = this.el;
    const a = this.auto;
    this.auto = null;
    if (a && this.start < 0 && el.selectionStart === el.selectionEnd && el.selectionStart === a.start + a.text.length
        && el.value.slice(a.start, a.start + a.text.length) === a.text) {
      const c = this.composer.restore(a.roman).composing;
      this.replace(a.start, a.start + a.text.length, c);
      this.start = a.start;
      this.len = c.length;
      this.keepStrict = true;
      this.emit();
      return;
    }
    if (this.start >= 0 && this.composer.backspace()) {
      const c = this.composer.state.composing;
      this.replace(this.start, this.start + this.len, c);
      this.len = c.length;
      if (!this.composer.state.buffer) {
        this.start = -1;
        this.len = 0;
        this.keepStrict = false;
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
    if (this.direct) this.emit();
  }

  /** Replace the word being typed with a suggestion. */
  choose(word: string): void {
    this.auto = null;
    this.keepStrict = false;
    if (this.start >= 0) {
      this.replace(this.start, this.start + this.len, this.composer.choose(word));
      this.start = -1;
      this.len = 0;
    } else if (this.direct) {
      const end = this.el.selectionStart ?? 0;
      const cur = this.directWord();
      if (!cur) return;
      this.replace(end - cur.length, end, word + " ");
      this.direct = false;
    } else return;
    this.opts.suggester?.learn(word);
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
    } else if (e.inputType === "deleteContentBackward" && (this.start >= 0 || this.auto)) {
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
    let out: string;
    if (this.scheme === "inscript") out = [...e.data].map((c) => layouts.inscript.keys[c] ?? c).join("");
    else {
      const sc = schemes[this.scheme];
      out = e.data.replace(/[A-Za-z~^_'|.]+/g, (w) =>
        this.opts.autoPick === false ? transliterate(w, sc) : commitWord(w, transliterate(w, sc), sc, this.opts.suggester, this.opts.speller));
    }
    this.replace(start, end, out);
  }

  private keyDown(e: KeyboardEvent) {
    if (this.start < 0 && !this.direct) return;
    if (e.key === "Tab") {
      const first = this.state.suggestions[0];
      if (!first) return;
      e.preventDefault();
      this.choose(first);
    } else if (e.key === "Escape" || e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") {
      this.reset();
    }
  }
}
