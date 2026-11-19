/**
 * Roman → Devanagari transliteration, driven by the JSON schemes in ./schemes.
 *
 * This file is the reference implementation. The Kotlin (android/) and Swift (ios/) ports
 * implement exactly the same algorithm and are checked against tests/vectors/*.json:
 *
 *   1. NFC-normalise the input.
 *   2. Walk it left to right, taking the LONGEST key from the scheme at each position.
 *   3. consonant: if the previous token was a bare consonant, emit a halant first (→ conjunct).
 *      vowel:     after a bare consonant emit its sign (matra; "" for a), else the letter.
 *      mark:      emit as is (ं ँ ः ् ऽ); it closes the syllable.
 *      symbol/unknown: close the syllable (halant first when the scheme has finalVirama).
 *   4. At the end, a bare consonant gets a halant only when the scheme has finalVirama.
 */
import type { Scheme } from "./schemes.js";

export const HALANT = "्";

type Kind = "consonant" | "vowel" | "mark" | "symbol";
interface Entry {
  kind: Kind;
  out: string;
  matra: string;
}

export interface CompiledScheme {
  id: string;
  name: string;
  finalVirama: boolean;
  table: Map<string, Entry>;
  maxKey: number;
  source: Scheme;
}

const cache = new Map<Scheme, CompiledScheme>();

export function compile(scheme: Scheme): CompiledScheme {
  const hit = cache.get(scheme);
  if (hit) return hit;
  const table = new Map<string, Entry>();
  const add = (key: string, e: Entry) => {
    const k = key.normalize("NFC");
    if (!table.has(k)) table.set(k, e); // first listing wins
  };
  for (const [k, out, matra] of scheme.vowels) add(k, { kind: "vowel", out, matra });
  for (const [k, out] of scheme.consonants) add(k, { kind: "consonant", out, matra: "" });
  for (const [k, out] of scheme.marks) add(k, { kind: "mark", out, matra: "" });
  for (const [k, out] of scheme.symbols) add(k, { kind: "symbol", out, matra: "" });
  let maxKey = 1;
  for (const k of table.keys()) maxKey = Math.max(maxKey, k.length);
  const compiled = { id: scheme.id, name: scheme.name, finalVirama: scheme.finalVirama, table, maxKey, source: scheme };
  cache.set(scheme, compiled);
  return compiled;
}

export function transliterate(input: string, scheme: Scheme | CompiledScheme): string {
  const s = "table" in scheme ? scheme : compile(scheme);
  const text = input.normalize("NFC");
  let out = "";
  let bare = false; // last emitted token is a consonant without a vowel sign
  let i = 0;
  while (i < text.length) {
    let entry: Entry | undefined;
    let len = Math.min(s.maxKey, text.length - i);
    for (; len > 0; len--) {
      entry = s.table.get(text.substr(i, len));
      if (entry) break;
    }
    if (!entry) {
      if (bare && s.finalVirama) out += HALANT;
      out += text[i];
      bare = false;
      i += 1;
      continue;
    }
    switch (entry.kind) {
      case "consonant":
        if (bare) out += HALANT;
        out += entry.out;
        bare = true;
        break;
      case "vowel":
        out += bare ? entry.matra : entry.out;
        bare = false;
        break;
      case "mark":
        out += entry.out;
        bare = false;
        break;
      case "symbol":
        if (bare && s.finalVirama) out += HALANT;
        out += entry.out;
        bare = false;
        break;
    }
    i += len;
  }
  if (bare && s.finalVirama) out += HALANT;
  return out;
}

// ---------------------------------------------------------------- Devanagari → Roman

interface Reverse {
  consonants: Map<string, string>;
  vowels: Map<string, string>;
  matras: Map<string, string>;
  other: Map<string, string>;
  inherent: string;
  finalVirama: boolean;
}

const reverseCache = new Map<Scheme, Reverse>();

function reverse(scheme: Scheme): Reverse {
  const hit = reverseCache.get(scheme);
  if (hit) return hit;
  const r: Reverse = {
    consonants: new Map(), vowels: new Map(), matras: new Map(), other: new Map(),
    inherent: "a", finalVirama: scheme.finalVirama,
  };
  const put = (m: Map<string, string>, k: string, v: string) => {
    const key = k.normalize("NFD"); // nukta letters decompose: क़ = क + ़
    if (key && !m.has(key)) m.set(key, v);
  };
  for (const [k, out, matra] of scheme.vowels) {
    if (matra === "" && out === "अ") r.inherent = k;
    put(r.vowels, out, k);
    if (matra) put(r.matras, matra, k);
  }
  for (const [k, out] of scheme.consonants) if ([...out.normalize("NFD")].length <= 2 && !out.includes(HALANT)) put(r.consonants, out, k);
  for (const [k, out] of [...scheme.marks, ...scheme.symbols]) put(r.other, out, k);
  reverseCache.set(scheme, r);
  return r;
}

/** Devanagari → roman in the given scheme (useful for IAST output and search keys). */
export function toRoman(input: string, scheme: Scheme): string {
  const r = reverse(scheme);
  const t = input.normalize("NFD");
  let out = "";
  for (let i = 0; i < t.length; ) {
    const two = t.substr(i, 2);
    const cons = r.consonants.get(two) !== undefined && two.length === 2 && two[1] === "़" ? two : t[i];
    const c = r.consonants.get(cons);
    if (c !== undefined) {
      out += c;
      i += cons.length;
      const next = t[i];
      if (next === HALANT) {
        i += 1;
      } else if (next !== undefined && r.matras.has(next)) {
        out += r.matras.get(next);
        i += 1;
      } else if (r.finalVirama || isDevanagariLetterOrSign(next)) {
        out += r.inherent;
      }
      continue;
    }
    const ch = t[i];
    out += r.vowels.get(ch) ?? r.other.get(ch) ?? ch;
    i += 1;
  }
  return out.normalize("NFC");
}

function isDevanagariLetterOrSign(ch: string | undefined): boolean {
  if (!ch) return false;
  const c = ch.charCodeAt(0);
  return c >= 0x0900 && c <= 0x0963 && c !== 0x093d;
}
