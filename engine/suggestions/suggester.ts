/**
 * Word suggestions for romanized typing.
 *
 * Romanized input is ambiguous (t/ट/त, s/श/ष/स, i/ि/ी, b/व, sanskrit → सन्स्क्रित vs संस्कृत), so
 * words are indexed by a phonetic skeleton that folds those differences away. The typed buffer is
 * transliterated, folded the same way, and matched by prefix. Ranking: exact match first, then
 * user-learned frequency, then corpus frequency, then shorter words.
 *
 * The skeleton rules are shared with the Kotlin and Swift ports (tests/vectors/skeleton.json).
 */

const FOLD: Record<string, string> = {
  "ी": "ि", "ू": "ु", "ई": "इ", "ऊ": "उ", "ॄ": "ृ", "ॠ": "ऋ",
  "ट": "त", "ठ": "थ", "ड": "द", "ढ": "ध", "ण": "न", "ङ": "न", "ञ": "न",
  "ष": "स", "श": "स", "व": "ब", "ं": "न", "ँ": "न", "ः": "",
  "ृ": "रि", "ऋ": "रि", "ै": "े", "ऐ": "ए", "ौ": "ो", "औ": "ओ",
  "\u094D": "", "\u093C": "", "\u200C": "", "\u200D": "",
};

export function skeleton(word: string): string {
  let out = "";
  for (const ch of word.normalize("NFC").normalize("NFD")) out += FOLD[ch] ?? ch;
  return out.normalize("NFC");
}

export type DictionaryEntry = [word: string, frequency: number];

interface Item {
  key: string;
  word: string;
  freq: number;
}

export interface SuggestOptions {
  limit?: number;
}

export class Suggester {
  private items: Item[] = [];
  private learned = new Map<string, number>();

  constructor(entries: DictionaryEntry[] = []) {
    this.add(entries);
  }

  add(entries: DictionaryEntry[]): void {
    for (const [word, freq] of entries) this.items.push({ key: skeleton(word), word, freq });
    this.items.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : b.freq - a.freq));
  }

  get size(): number {
    return this.items.length;
  }

  /** Remember a word the user committed; it ranks above corpus words from now on. */
  learn(word: string): void {
    this.learned.set(word, (this.learned.get(word) ?? 0) + 1);
    if (!this.items.some((i) => i.word === word)) this.add([[word, 0]]);
  }

  exportLearned(): DictionaryEntry[] {
    return [...this.learned.entries()];
  }

  importLearned(entries: DictionaryEntry[]): void {
    for (const [w, n] of entries) {
      this.learned.set(w, n);
      if (!this.items.some((i) => i.word === w)) this.add([[w, 0]]);
    }
  }

  /** Suggestions for the Devanagari the user has composed so far. */
  suggest(composed: string, opts: SuggestOptions = {}): string[] {
    const limit = opts.limit ?? 5;
    if (!composed) return [];
    const key = skeleton(composed);
    let lo = 0;
    let hi = this.items.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.items[mid].key < key) lo = mid + 1;
      else hi = mid;
    }
    const pool: Item[] = [];
    for (let i = lo; i < this.items.length && pool.length < 4000; i++) {
      if (!this.items[i].key.startsWith(key)) break;
      pool.push(this.items[i]);
    }
    const score = (it: Item) =>
      (it.word === composed ? 1e12 : 0) + (it.key === key ? 1e9 : 0) + (this.learned.get(it.word) ?? 0) * 1e6 + it.freq;
    pool.sort((a, b) => score(b) - score(a) || a.word.length - b.word.length);
    const out: string[] = [];
    for (const it of pool) {
      if (!out.includes(it.word)) out.push(it.word);
      if (out.length >= limit) break;
    }
    return out;
  }
}
