/** Devanagari Unicode helpers: normalisation, akshara segmentation, digits, validation. */

export const HALANT = "्";
export const NUKTA = "़";
export const ZWJ = "‍";
export const ZWNJ = "‌";

const range = (a: number, b: number) => (c: number) => c >= a && c <= b;
export const isConsonantCode = (c: number) =>
  range(0x0915, 0x0939)(c) || range(0x0958, 0x095f)(c) || range(0x0978, 0x097f)(c);
export const isIndependentVowelCode = (c: number) =>
  range(0x0904, 0x0914)(c) || range(0x0960, 0x0961)(c) || range(0x0972, 0x0977)(c);
export const isMatraCode = (c: number) =>
  range(0x093e, 0x094c)(c) || range(0x094e, 0x094f)(c) || range(0x0955, 0x0957)(c) || range(0x0962, 0x0963)(c) || c === 0x093a || c === 0x093b;
export const isModifierCode = (c: number) => range(0x0900, 0x0903)(c) || range(0x0951, 0x0954)(c) || range(0x1cd0, 0x1cf9)(c) || range(0xa8e0, 0xa8f1)(c);

export function isDevanagari(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (range(0x0900, 0x097f)(c) || range(0xa8e0, 0xa8ff)(c) || range(0x1cd0, 0x1cff)(c)) return true;
  }
  return false;
}

const NUKTA_COMPOSE: Record<string, string> = {
  "क़": "क़", "ख़": "ख़", "ग़": "ग़", "ज़": "ज़",
  "ड़": "ड़", "ढ़": "ढ़", "फ़": "फ़", "य़": "य़",
};

export interface NormalizeOptions {
  /** "decompose" (Unicode NFC default: क + ़) or "compose" (precomposed क़, as many legacy texts store it). */
  nukta?: "decompose" | "compose";
  /** Replace ASCII | and || with danda । and double danda ॥. */
  danda?: boolean;
}

/**
 * NFC plus fixes for mistakes common in typed and converted Nepali/Sanskrit text:
 * duplicate halants or vowel signs, a halant before a vowel sign, stray ZWJ/ZWNJ that do nothing.
 */
export function normalize(text: string, opts: NormalizeOptions = {}): string {
  let t = text.normalize("NFC");
  t = t.replace(/्{2,}/g, HALANT);
  t = t.replace(/्(?=[ा-ौ])/g, "");
  t = t.replace(/([ा-ौ])\1+/g, "$1");
  t = t.replace(/[‌‍]+(?![क-हक़-य़])/g, (m, off: number, s: string) =>
    s[off - 1] === HALANT ? m : "");
  if (opts.danda) t = t.replace(/\|\|/g, "॥").replace(/\|/g, "।");
  if (opts.nukta === "compose") t = t.replace(/[क-य]़/g, (m) => NUKTA_COMPOSE[m] ?? m);
  return t;
}

/**
 * Split text into aksharas (orthographic syllables): कृ · ष्ण · ं … so that cursors, backspace
 * and counts work on what readers see as one letter. Non-Devanagari text splits by code point.
 */
export function aksharas(text: string): string[] {
  const out: string[] = [];
  const cps = [...text.normalize("NFC")];
  let i = 0;
  const code = (k: number) => (k < cps.length ? cps[k].codePointAt(0)! : -1);
  while (i < cps.length) {
    const start = i;
    const c = code(i);
    if (isConsonantCode(c)) {
      i++;
      if (code(i) === 0x093c) i++;
      while (code(i) === 0x094d && (isConsonantCode(code(i + 1)) || code(i + 1) === 0x200d || code(i + 1) === 0x200c)) {
        i++;
        if (code(i) === 0x200d || code(i) === 0x200c) i++;
        if (isConsonantCode(code(i))) i++;
        if (code(i) === 0x093c) i++;
      }
      if (code(i) === 0x094d) i++;
      else if (isMatraCode(code(i))) i++;
    } else if (isIndependentVowelCode(c)) {
      i++;
    } else {
      i++;
    }
    while (isModifierCode(code(i))) i++;
    out.push(cps.slice(start, i).join(""));
  }
  return out;
}

const DEV_DIGITS = "०१२३४५६७८९";
export const toDevanagariDigits = (s: string) => s.replace(/[0-9]/g, (d) => DEV_DIGITS[+d]);
export const toAsciiDigits = (s: string) => s.replace(/[०-९]/g, (d) => String(DEV_DIGITS.indexOf(d)));

export interface Issue {
  index: number;
  kind: "orphan-sign" | "double-sign" | "halant-before-sign" | "double-halant";
  text: string;
}

/** Report sequences no shaping engine can render sensibly (the dotted circle ◌ cases). */
export function validate(text: string): Issue[] {
  const issues: Issue[] = [];
  const cps = [...text];
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i].codePointAt(0)!;
    const p = i > 0 ? cps[i - 1].codePointAt(0)! : -1;
    if (isMatraCode(c) || c === 0x094d) {
      if (c === 0x094d && p === 0x094d) issues.push({ index: i, kind: "double-halant", text: cps[i] });
      else if (isMatraCode(c) && p === 0x094d) issues.push({ index: i, kind: "halant-before-sign", text: cps[i] });
      else if (isMatraCode(c) && isMatraCode(p)) issues.push({ index: i, kind: "double-sign", text: cps[i] });
      else if (!(isConsonantCode(p) || p === 0x093c)) issues.push({ index: i, kind: "orphan-sign", text: cps[i] });
    }
  }
  return issues;
}
