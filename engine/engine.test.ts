import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  Composer, Speller, Suggester, aksharas, keyboards, candidates, commitWord, tokenize, iast, nepaliRoman, normalize, schemes, skeleton, toAsciiDigits,
  toDevanagariDigits, toRoman, transliterate, validate, type DictionaryEntry,
} from "./index.js";

const vectors = (name: string) =>
  JSON.parse(readFileSync(new URL(`../tests/vectors/${name}.json`, import.meta.url), "utf8")).cases;

describe("transliteration vectors (shared with Kotlin and Swift)", () => {
  for (const c of vectors("transliteration")) {
    it(`${c.scheme}: ${c.input}`, () => expect(transliterate(c.input, schemes[c.scheme])).toBe(c.output));
  }
});

describe("no Latin letter ever comes through", () => {
  const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (const [id, s] of Object.entries(schemes)) {
    it(id, () => {
      for (const c of letters) expect(transliterate(c, s), `${id}: ${c}`).not.toMatch(/[A-Za-z]/);
    });
  }
});

describe("toRoman vectors", () => {
  for (const c of vectors("roman")) {
    it(`${c.scheme}: ${c.input}`, () => expect(toRoman(c.input, schemes[c.scheme])).toBe(c.output));
  }
});

describe("skeleton vectors", () => {
  for (const c of vectors("skeleton")) it(c.input, () => expect(skeleton(c.input)).toBe(c.output));
});

describe("round trip", () => {
  it("IAST → Devanagari → IAST", () => {
    const s = "dharmakṣetre kurukṣetre samavetā yuyutsavaḥ";
    expect(toRoman(transliterate(s, iast), iast)).toBe(s);
  });
});

describe("Composer", () => {
  it("composes, backspaces by roman key and commits on space", () => {
    const c = new Composer(nepaliRoman);
    for (const ch of "namaste") c.key(ch);
    expect(c.state.composing).toBe("नमस्ते");
    c.backspace();
    expect(c.state).toEqual({ buffer: "namast", composing: "नमस्त" });
    c.key("e");
    expect(c.key(" ").commit).toBe("नमस्ते ");
    expect(c.backspace()).toBe(false);
  });
  it("choose replaces the composing word", () => {
    const c = new Composer(nepaliRoman);
    for (const ch of "kathmandu") c.key(ch);
    expect(c.choose("काठमाडौं")).toBe("काठमाडौं ");
    expect(c.state.buffer).toBe("");
  });
});

describe("unicode", () => {
  it("segments aksharas", () => {
    expect(aksharas("कृष्णः")).toEqual(["कृ", "ष्णः"]);
    expect(aksharas("स्त्री")).toEqual(["स्त्री"]);
    expect(aksharas("नमस्ते")).toEqual(["न", "म", "स्ते"]);
    expect(aksharas("भगवान्")).toEqual(["भ", "ग", "वा", "न्"]);
  });
  it("normalises common mistakes", () => {
    expect(normalize("क््ष")).toBe("क्ष");
    expect(normalize("किि")).toBe("कि");
    expect(normalize("क़", { nukta: "compose" })).toBe("क़");
    expect(normalize("राम | सीता ||", { danda: true })).toBe("राम । सीता ॥");
    expect(normalize("र्‍य")).toBe("र्‍य");
  });
  it("validates", () => {
    expect(validate("नमस्ते")).toEqual([]);
    expect(validate("ाक")[0].kind).toBe("orphan-sign");
    expect(validate("किी")[0].kind).toBe("double-sign");
  });
  it("converts digits", () => {
    expect(toDevanagariDigits("2083")).toBe("२०८३");
    expect(toAsciiDigits("२०८३")).toBe("2083");
  });
});

describe("Suggester", () => {
  const ne: DictionaryEntry[] = JSON.parse(readFileSync(new URL("./suggestions/data/ne.json", import.meta.url), "utf8"));
  const s = new Suggester(ne);
  it("loads the Nepali dictionary", () => expect(s.size).toBeGreaterThan(3000));
  it("suggests through romanization ambiguity", () => {
    const out = s.suggest(transliterate("sabai", nepaliRoman));
    expect(out).toContain("सबै");
  });
  it("ranks learned words first", () => {
    const t = new Suggester([["शान्ति", 100], ["शान्त", 50], ["सान्त्वना", 10]]);
    expect(t.suggest("शान्")[0]).toBe("शान्ति");
    t.learn("सान्त्वना");
    expect(t.suggest("शान्")[0]).toBe("सान्त्वना");
  });
  it("suggests an exact word first", () => {
    const t = new Suggester([["संस्कृत", 10], ["संस्कृति", 100]]);
    expect(t.suggest(transliterate("saMskRt", nepaliRoman))[0]).toBe("संस्कृत");
  });
});

describe("loose Romanized Nepali (type it the way it sounds)", () => {
  const sc = schemes["nepali-roman"];
  const sug = new Suggester(JSON.parse(readFileSync(new URL("./suggestions/data/ne.json", import.meta.url), "utf8")));
  const sp = new Speller(JSON.parse(readFileSync(new URL("./suggestions/data/bigrams.json", import.meta.url), "utf8")));
  const commit = (roman: string) => commitWord(roman, transliterate(roman, sc), sc, sug, sp);

  it("Space commits the dictionary word for plain lowercase typing", () => {
    const expected: Record<string, string> = {
      dhakal: "ढकाल", paudel: "पौडेल", nepal: "नेपाल", shanti: "शान्ति", gyan: "ज्ञान", rishi: "ऋषि",
      krishna: "कृष्ण", prithvi: "पृथ्वी", sanskrit: "संस्कृत", dhanyabad: "धन्यवाद", adhikari: "अधिकारी",
      tapai: "तपाईं", kaha: "कहाँ", cha: "छ", ram: "राम", kam: "काम", sita: "सीता", dudh: "दूध", sushil: "सुशील",
      namaste: "नमस्ते", mero: "मेरो", ghar: "घर",
    };
    for (const [roman, word] of Object.entries(expected)) expect(commit(roman), roman).toBe(word);
  });

  it("keeps the strict spelling when the user typed a capital or the word is unknown", () => {
    expect(commit("Dhakaal")).toBe("ढकाल");
    expect(commit("DhakAl")).toBe("ढकाल");
    expect(commit("dhaKal")).toBe("धकल");
    expect(commit("xyzq")).toBe(transliterate("xyzq", sc));
  });

  it("offers the right spelling in the candidate bar even when it is not the strict reading", () => {
    for (const [roman, word] of [["dhakal", "ढकाल"], ["sanga", "सँग"], ["bikas", "विकास"], ["sahar", "शहर"], ["thapa", "थापा"]]) {
      expect(candidates(roman, transliterate(roman, sc), sc, sug, sp), roman).toContain(word);
    }
  });

  it("spells unknown words plausibly from letter pairs", () => {
    expect(sp.variants("dhakal", sc, 5)).toContain("ढकल");
    expect(sp.variants("Dhakal", sc)).toEqual([]);
    expect(tokenize("chhaina").map((t) => t[0])).toEqual(["chh", "ai", "n", "a"]);
  });

  it("matches tests/vectors/spellings.json", () => {
    const v = JSON.parse(readFileSync(new URL("../tests/vectors/spellings.json", import.meta.url), "utf8"));
    for (const c of v.cases) {
      expect(transliterate(c.roman, sc)).toBe(c.composed);
      expect(sp.variants(c.roman, sc, 5), c.roman).toEqual(c.variants);
      expect(commitWord(c.roman, c.composed, sc, sug, sp), c.roman).toBe(c.commit);
      expect(candidates(c.roman, c.composed, sc, sug, sp), c.roman).toEqual(c.candidates);
    }
  });
});

describe("Nepali traditional phone layout", () => {
  const l = keyboards["nepali-traditional"];
  it("has the traditional key order", () => {
    expect(l.rows.map((r) => r.map(([t]) => t).join(""))).toEqual(["ञघङझछटठडढण्", "धभचतथगषयउृे", "बकमानजवपिसु", "शहअखदलफ,र"]);
  });
  it("types only Devanagari and punctuation, never a Latin letter", () => {
    for (const row of [...l.rows, [...l.bottom]]) for (const [tap, hold] of row) expect(tap + hold).not.toMatch(/[A-Za-z]/);
    for (const [tap, hold] of l.rows.flat()) expect(tap).not.toBe(hold);
  });
});

// Every mode must insert plain standard Unicode: nothing from a Private Use Area, nothing a
// particular font has to know about, and nothing NFC would change. The font is only for display.
describe("standard unicode output", () => {
  const allowed = (ch: string) => {
    const c = ch.codePointAt(0)!;
    return (c >= 0x20 && c <= 0x7e) // ASCII digits and punctuation
      || (c >= 0x0900 && c <= 0x097f) // Devanagari
      || (c >= 0x1cd0 && c <= 0x1cff) // Vedic Extensions
      || (c >= 0xa8e0 && c <= 0xa8ff) // Devanagari Extended
      || c === 0x200c || c === 0x200d // ZWNJ, ZWJ
      || c === 0x20b9 // ₹
      || c === 0x5350; // 卐 (standard Unicode, drawn by the system font)
  };
  const bad = (s: string) => [...s].filter((ch) => !allowed(ch)).map((ch) => `U+${ch.codePointAt(0)!.toString(16)}`);

  for (const [id, layout] of Object.entries(keyboards)) {
    it(`${id}: every key inserts standard NFC Unicode`, () => {
      const outs: string[] = [];
      const take = (k: unknown) => { if (Array.isArray(k)) for (const s of k) if (typeof s === "string") outs.push(s); };
      for (const row of layout.rows) row.forEach(take);
      layout.bottom?.forEach(take);
      for (const row of layout.numbers ?? []) row.forEach(take);
      expect(outs.length).toBeGreaterThan(30);
      for (const s of outs) {
        expect(bad(s), `${id} key ${s}`).toEqual([]);
        expect(s.normalize("NFC"), `${id} key ${s} is not NFC`).toBe(s);
      }
    });
  }

  it("transliteration output is standard NFC Unicode for every scheme", () => {
    for (const name of ["transliteration", "roman", "spellings"]) {
      const raw = JSON.stringify(vectors(name));
      for (const s of raw.match(/[ऀ-ॿ᳐-᳿꣠-ꣿ‌‍]+/g) ?? []) {
        expect(s.normalize("NFC")).toBe(s);
      }
      expect(raw).not.toMatch(/[-]/);
    }
    const samples: [string, string][] = [["nepali-roman", "dhakal kRShNa"], ["iast", "agnimīḷe purohitaṃ saṃskṛtam"], ["itrans", "kRRiShNa j~nAna"], ["harvard-kyoto", "kRSNa jJAna"]];
    for (const [id, w] of samples) {
      const s = (schemes as Record<string, Parameters<typeof transliterate>[1]>)[id];
      if (!s) continue;
      const out = transliterate(w, s);
      expect(bad(out), `${id}: ${out}`).toEqual([]);
      expect(out).not.toMatch(/[a-zA-Zāīūṛṝḷṃḥṅñṭḍṇśṣ]/);
      expect(out.normalize("NFC")).toBe(out);
    }
  });

  it("every dictionary word is standard NFC Devanagari", () => {
    for (const lang of ["ne", "sa"]) {
      const words: [string, number][] = JSON.parse(readFileSync(new URL(`./suggestions/data/${lang}.json`, import.meta.url), "utf8"));
      const wrong = words.map((e) => e[0]).filter((w) => bad(w).length || w.normalize("NFC") !== w || !/^[ऀ-ॿ᳐-᳿꣠-ꣿ‌‍]+$/.test(w));
      expect(wrong.slice(0, 10)).toEqual([]);
    }
  });
});
