/**
 * Spelling variants for a word typed loosely in Romanized Nepali.
 *
 * Strict Romanized Nepali needs capitals and doubled vowels (Dhakaal → ढकाल), which nobody types.
 * When a word is not in the dictionary, the keyboard still offers the likely spellings: each
 * ambiguous roman letter is tried in its other readings (d → द or ड, a → अ or आ, s → स, श or ष …),
 * every reading is transliterated with the strict scheme, and the results are ranked by how
 * natural their letter pairs are in the dictionaries (suggestions/data/bigrams.json).
 *
 * Only lowercase input gets variants: a capital means the user chose a letter on purpose.
 * The Kotlin and Swift ports implement the same algorithm (tests/vectors/spellings.json).
 */
import { transliterate } from "../transliteration/transliterator.js";
import type { Scheme } from "../transliteration/schemes.js";
import { skeleton, type Suggester } from "./suggester.js";

/** Roman tokens and the strict spellings each may stand for, longest token first. */
export const ALTERNATIVES: [token: string, readings: string[]][] = [
  ["chh", ["chh"]],
  ["aa", ["aa"]], ["ii", ["ii"]], ["uu", ["uu"]], ["ee", ["ee"]], ["oo", ["oo"]],
  ["ai", ["ai", "aai", "aaii"]], ["au", ["au", "aau"]],
  ["sh", ["sh", "Sh"]], ["dh", ["dh", "Dh"]], ["th", ["th", "Th"]], ["ch", ["ch", "chh"]],
  ["ri", ["ri", "rii", "R"]], ["ng", ["ng", "~g", "Mg"]],
  ["a", ["a", "aa"]], ["i", ["i", "ii"]], ["u", ["u", "uu"]], ["e", ["e", "ai"]], ["o", ["o", "au"]],
  ["d", ["d", "D"]], ["t", ["t", "T"]], ["n", ["n", "N"]], ["s", ["s", "sh", "Sh"]],
  ["b", ["b", "w"]], ["v", ["v", "b"]], ["w", ["w", "b"]],
];

const BEAM = 24;
const ALPHA = 0.5;
const VOCAB = 100;

export class Speller {
  private pair = new Map<string, number>();
  private first = new Map<string, number>();

  /** bigrams: suggestions/data/bigrams.json ({"ab": count}). */
  constructor(bigrams: Record<string, number>) {
    for (const [k, n] of Object.entries(bigrams)) {
      this.pair.set(k, n);
      this.first.set(k[0], (this.first.get(k[0]) ?? 0) + n);
    }
  }

  /** Log-likelihood of a Devanagari word under the letter-pair model. */
  score(word: string, final: boolean): number {
    const s = "^" + word + (final ? "$" : "");
    let total = 0;
    for (let i = 0; i + 1 < s.length; i++) {
      const n = this.pair.get(s[i] + s[i + 1]) ?? 0;
      total += Math.log((n + ALPHA) / ((this.first.get(s[i]) ?? 0) + ALPHA * VOCAB));
    }
    return total;
  }

  /** Likely Devanagari spellings of a lowercase roman word, best first. */
  variants(roman: string, scheme: Scheme, limit = 5): string[] {
    if (!roman || /[A-Z]/.test(roman) || !/[a-z]/.test(roman)) return [];
    const tokens = tokenize(roman);
    let beam: { roman: string; score: number }[] = [{ roman: "", score: 0 }];
    for (const readings of tokens) {
      const next: { roman: string; score: number }[] = [];
      for (const b of beam) {
        for (const r of readings) {
          const rr = b.roman + r;
          next.push({ roman: rr, score: this.score(transliterate(rr, scheme), false) });
        }
      }
      next.sort(byScore);
      beam = next.slice(0, BEAM);
    }
    const done = beam.map((b) => {
      const word = transliterate(b.roman, scheme);
      return { roman: word, score: this.score(word, true) };
    });
    done.sort(byScore);
    const out: string[] = [];
    for (const d of done) {
      if (!out.includes(d.roman)) out.push(d.roman);
      if (out.length >= limit) break;
    }
    return out;
  }
}

function byScore(a: { roman: string; score: number }, b: { roman: string; score: number }): number {
  return b.score - a.score || (a.roman < b.roman ? -1 : a.roman > b.roman ? 1 : 0);
}

/** Split a lowercase roman word into tokens, each with its readings (longest match first). */
export function tokenize(roman: string): string[][] {
  const out: string[][] = [];
  let i = 0;
  while (i < roman.length) {
    const hit = ALTERNATIVES.find(([t]) => roman.startsWith(t, i));
    if (hit) {
      out.push(hit[1]);
      i += hit[0].length;
    } else {
      out.push([roman[i]]);
      i += 1;
    }
  }
  return out;
}

interface Lookup {
  whole: string[];
  variants: string[];
  longer: string[];
}

/**
 * Searches the dictionary with the strict transliteration and with the best spelling variants
 * (so "tapai" also searches तपाइ and finds तपाईं). A word is a whole match when it folds to the
 * same skeleton as the typed form; a final ं or ँ is ignored for this, since it is rarely typed
 * ("kaha" for कहाँ, "tapai" for तपाईं).
 */
function lookup(roman: string, composed: string, scheme: Scheme, suggester?: Suggester, speller?: Speller, limit = 6): Lookup {
  const variants = speller && scheme.id === "nepali-roman" ? speller.variants(roman, scheme, 8) : [];
  const whole: string[] = [];
  const longer: string[] = [];
  if (suggester && composed) {
    // Typed "sushil" (no final vowel): सुशीला is not the same word, though ा folds away.
    const bareEnd = scheme.id === "nepali-roman" && !/[aeiouAEIOU~M]$/.test(roman);
    for (const form of [composed, ...variants]) {
      const key = wholeKey(form);
      for (const w of suggester.suggest(form, { limit: limit * 2 })) {
        const isWhole = wholeKey(w) === key && !(bareEnd && w.endsWith("ा"));
        const list = isWhole ? whole : longer;
        if (!list.includes(w)) list.push(w);
      }
    }
    // Common words first; ties keep discovery order (the strict form's matches come first).
    const order = new Map(whole.map((w, i) => [w, i]));
    whole.sort((a, b) => suggester.weight(b) - suggester.weight(a) || order.get(a)! - order.get(b)!);
  }
  return { whole, variants, longer };
}

/**
 * What the candidate bar shows for the word being typed: up to three whole-word dictionary matches,
 * the best spelling variant, two longer dictionary words that start the same way, then the rest
 * in the same order. When nothing
 * matches, the strict transliteration is the only candidate.
 */
export function candidates(
  roman: string,
  composed: string,
  scheme: Scheme,
  suggester?: Suggester,
  speller?: Speller,
  limit = 6,
): string[] {
  if (!composed) return [];
  const { whole, variants, longer } = lookup(roman, composed, scheme, suggester, speller, limit);
  const out: string[] = [];
  const push = (w: string) => {
    if (w && !out.includes(w) && out.length < limit) out.push(w);
  };
  // A few of each kind first, so completions (saba → सबै) are not crowded out by look-alikes.
  whole.slice(0, 3).forEach(push);
  variants.slice(0, 1).forEach(push);
  longer.slice(0, 2).forEach(push);
  whole.forEach(push);
  variants.slice(0, 2).forEach(push);
  longer.forEach(push);
  if (!out.length) push(composed);
  return out;
}

/**
 * The word Space (or any commit key) should insert: the best whole-word dictionary match, so
 * "dhakal" commits ढकाल. Falls back to the strict transliteration when the dictionary has no
 * whole match, for a single key, and when the user typed a capital (a deliberate strict spelling).
 */
export function commitWord(roman: string, composed: string, scheme: Scheme, suggester?: Suggester, speller?: Speller): string {
  if (!composed || roman.length < 2 || /[A-Z]/.test(roman) || scheme.id !== "nepali-roman") return composed;
  // Never add a nukta the user did not type (k → क, not क़).
  const nukta = (w: string) => (w.normalize("NFD").match(/\u093C/g) ?? []).length;
  const best = lookup(roman, composed, scheme, suggester, speller).whole.find((w) => nukta(w) === nukta(composed));
  // Same letters (nukta forms like क़ may differ only in Unicode composition): keep what was typed.
  return best === undefined || best.normalize("NFD") === composed.normalize("NFD") ? composed : best;
}

function wholeKey(word: string): string {
  return skeleton(word.replace(/[ंँ]+$/, ""));
}
