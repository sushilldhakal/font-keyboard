// Build a suggestion dictionary (word frequency list) from plain-text corpora.
//   node scripts/build-dictionary.mjs <lang> <limit> [--lines <regex>] [--exclude <dict.json>] <file...>
//   --lines    only count words on lines matching the regex (e.g. "॥" keeps Sanskrit verse lines)
//   --exclude  drop words that rank higher in another language's dictionary (e.g. Hindi prose)
// Writes suggestions/data/<lang>.json as [[word, count], ...], most frequent first.
// Only clean Devanagari words (no orphan vowel signs, 2+ aksharas) seen at least 3 times are kept.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const linesRe = opt("--lines");
const excludeFile = opt("--exclude");
const [lang, limitArg, ...files] = args;
if (!lang || !files.length) {
  console.error("usage: build-dictionary.mjs <lang> <limit> <file...>");
  process.exit(1);
}
const limit = Number(limitArg) || 20000;
const counts = new Map();
const word = /[ऀ-ॣ॰-ॿ‌‍]+/g;
const valid = /^(?:[अ-औॠॡॲ-ॷ]|[क-हक़-य़ॸ-ॿ]़?(?:्[‌‍]?[क-हक़-य़ॸ-ॿ]़?)*(?:[ा-ौॢॣ]|्)?)[ऀ-ः]*(?:(?:[अ-औॠॡॲ-ॷ]|[क-हक़-य़ॸ-ॿ]़?(?:्[‌‍]?[क-हक़-य़ॸ-ॿ]़?)*(?:[ा-ौॢॣ]|्)?)[ऀ-ः]*)+$/;
for (const f of files) {
  let text = readFileSync(f, "utf8").normalize("NFC");
  if (linesRe) text = text.split("\n").filter((l) => new RegExp(linesRe).test(l)).join("\n");
  for (const m of text.matchAll(word)) {
    const w = m[0].replace(/[‌‍]+$/, "");
    if (w.length < 2 || !valid.test(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
}
const exclude = new Map();
if (excludeFile) {
  const ex = JSON.parse(readFileSync(excludeFile, "utf8"));
  ex.forEach(([w, n]) => exclude.set(w, n));
}
const total = [...counts.values()].reduce((a, b) => a + b, 0) || 1;
const exTotal = [...exclude.values()].reduce((a, b) => a + b, 0) || 1;
for (const [w, n] of [...counts]) if (exclude.has(w) && exclude.get(w) / exTotal >= n / total) counts.delete(w);
const list = [...counts.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, limit);
const out = lang.endsWith(".json") ? lang : join(dirname(fileURLToPath(import.meta.url)), "..", "suggestions", "data", `${lang}.json`);
writeFileSync(out, "[\n" + list.map((e) => JSON.stringify(e)).join(",\n") + "\n]\n");
console.log(`${lang}: ${list.length} words from ${files.length} file(s) → ${out}`);
