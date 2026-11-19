/**
 * Keyboard-facing state machine shared by every input surface (web, Android, iOS).
 *
 * The user types roman keys into a composing buffer; the composing text shown inline is
 * transliterate(buffer). Space, Enter or punctuation commits it. Backspace removes the last
 * ROMAN key, so "namaste" → backspace → "namast" shows नमस्त, exactly what was typed.
 */
import { compile, transliterate, type CompiledScheme } from "./transliterator.js";
import type { Scheme } from "./schemes.js";

export interface ComposerState {
  /** Roman keys typed for the current word. */
  buffer: string;
  /** Devanagari preview of the buffer. */
  composing: string;
}

export interface KeyResult extends ComposerState {
  /** Text to insert permanently (may be ""). */
  commit: string;
}

/** Keys that end a word and are inserted as themselves (after the word). */
export const COMMIT_KEYS = new Set([" ", "\n", "\t", ",", "?", "!", ";", ":", "\"", "(", ")", "[", "]", "{", "}", "/", "-"]);

export class Composer {
  private scheme: CompiledScheme;
  private buf = "";

  constructor(scheme: Scheme) {
    this.scheme = compile(scheme);
  }

  setScheme(scheme: Scheme): void {
    this.scheme = compile(scheme);
  }

  get state(): ComposerState {
    return { buffer: this.buf, composing: transliterate(this.buf, this.scheme) };
  }

  /** Feed one key (a single character). */
  key(ch: string): KeyResult {
    if (COMMIT_KEYS.has(ch)) {
      const word = transliterate(this.buf, this.scheme);
      this.buf = "";
      return { buffer: "", composing: "", commit: word + ch };
    }
    this.buf += ch;
    return { ...this.state, commit: "" };
  }

  /** Returns false when the buffer was already empty (the host should delete normally). */
  backspace(): boolean {
    if (!this.buf) return false;
    this.buf = [...this.buf].slice(0, -1).join("");
    return true;
  }

  /** Commit the composing text as is (e.g. on focus loss or when a suggestion is not chosen). */
  flush(): string {
    const word = transliterate(this.buf, this.scheme);
    this.buf = "";
    return word;
  }

  /** Replace the composing word with a chosen suggestion. */
  choose(word: string, trailing = " "): string {
    this.buf = "";
    return word + trailing;
  }
}
