// Adds a word list (one word per line, or a Hunspell .dic whose "/flags" are stripped) to a
// dictionary in suggestions/data. Words already there keep their corpus count; new words get
// count 1, so corpus words rank first and the list fills the gaps (names, modern vocabulary).
//
//   node scripts/merge-wordlist.mjs ne ne_NP.dic
//
// ne_NP.dic: Nepali spell-checking dictionary, Madan Puraskar Pustakalaya, LGPL 2.1
// (https://github.com/LibreOffice/dictionaries/tree/master/ne_NP).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [lang, ...files] = process.argv.slice(2);
if (!lang || !files.length) {
  console.error("usage: merge-wordlist.mjs <lang> <wordlist...>");
  process.exit(1);
}
const path = join(dirname(fileURLToPath(import.meta.url)), "..", "suggestions", "data", `${lang}.json`);
const entries = JSON.parse(readFileSync(path, "utf8"));
const have = new Set(entries.map(([w]) => w));
const valid = /^(?:[अ-औॠॡ]|[क-हक़-य़]़?(?:\u094D[क-हक़-य़]़?)*(?:[ा-ौॢॣ]|्)?)[\u0901-\u0903]*(?:(?:[अ-औॠॡ]|[क-हक़-य़]़?(?:\u094D[क-हक़-य़]़?)*(?:[ा-ौॢॣ]|्)?)[\u0901-\u0903]*)*$/;
let added = 0;
for (const f of files) {
  const lines = readFileSync(f, "utf8").normalize("NFC").split(/\r?\n/);
  for (const line of lines) {
    const w = line.split("/")[0].trim().replace(/[‌‍]/g, "");
    if (!w || /^\d+$/.test(w) || !valid.test(w) || have.has(w)) continue;
    have.add(w);
    entries.push([w, 1]);
    added++;
  }
}
entries.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
writeFileSync(path, "[\n" + entries.map((e) => JSON.stringify(e)).join(",\n") + "\n]\n");
console.log(`${lang}: +${added} words, ${entries.length} total → ${path}`);
