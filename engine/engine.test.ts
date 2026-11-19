import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  Composer, Suggester, aksharas, iast, nepaliRoman, normalize, schemes, skeleton, toAsciiDigits,
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
