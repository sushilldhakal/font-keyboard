// Letter-pair counts used to rank spelling variants of a romanized word (suggestions/spellings.ts).
// Every dictionary word counts once, framed as ^word$, so the model learns which letters start and
// end words as well as which follow each other. Output: suggestions/data/bigrams.json.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const data = join(dirname(fileURLToPath(import.meta.url)), "..", "suggestions", "data");
const counts = new Map();
for (const lang of ["ne", "sa"]) {
  for (const [w] of JSON.parse(readFileSync(join(data, `${lang}.json`), "utf8"))) {
    const s = "^" + w + "$";
    for (let i = 0; i + 1 < s.length; i++) {
      const k = s[i] + s[i + 1];
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
}
const out = Object.fromEntries([...counts].filter(([, n]) => n >= 2).sort((a, b) => (a[0] < b[0] ? -1 : 1)));
writeFileSync(join(data, "bigrams.json"), JSON.stringify(out) + "\n");
console.log(`bigrams.json: ${Object.keys(out).length} pairs`);
