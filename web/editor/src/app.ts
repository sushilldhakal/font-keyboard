import { Suggester, iast, toRoman, type DictionaryEntry } from "@nagosi/engine";
import neDict from "@nagosi/engine/dictionaries/ne.json";
import saDict from "@nagosi/engine/dictionaries/sa.json";
import { NagosiInput, OnScreenKeyboard, type SchemeId } from "@nagosi/keyboard";
import stacksTxt from "../../../font/builds/stacks.txt";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const text = $<HTMLTextAreaElement>("text");
const schemeSel = $<HTMLSelectElement>("scheme");
const langSel = $<HTMLSelectElement>("lang");
const wght = $<HTMLInputElement>("wght");
const size = $<HTMLInputElement>("size");
const suggestEl = $("suggest");
const hint = $("hint");
const romanEl = $("roman");

const store = {
  get(k: string): string | null {
    try { return localStorage.getItem("nagosi:" + k); } catch { return null; }
  },
  set(k: string, v: string) {
    try { localStorage.setItem("nagosi:" + k, v); } catch { /* storage blocked: settings just don't persist */ }
  },
};

const dictionaries: Record<string, Suggester> = {
  ne: new Suggester(neDict as DictionaryEntry[]),
  sa: new Suggester(saDict as DictionaryEntry[]),
};

const HINTS: Record<string, string> = {
  "nepali-roman": "Type as you would in chat: <kbd>namaste</kbd> → नमस्ते, <kbd>nepaal</kbd> → नेपाल, <kbd>kaaThamaaDauM</kbd> → काठमाडौं. Capitals: <kbd>T D N Sh</kbd> = ट ड ण ष. <kbd>~</kbd> ँ, <kbd>M</kbd> ं, <kbd>_</kbd> halant, <kbd>.</kbd> । <kbd>Tab</kbd> takes the first suggestion.",
  iast: "Type IAST with diacritics: <kbd>dharmakṣetre</kbd> → धर्मक्षेत्रे, <kbd>saṃskṛtam</kbd> → संस्कृतम्. A final consonant gets a halant. <kbd>|</kbd> । <kbd>||</kbd> ॥",
  itrans: "ITRANS in plain ASCII: <kbd>dharmakShetre</kbd> → धर्मक्षेत्रे, <kbd>raamaH</kbd> → रामः, <kbd>.N</kbd> ँ, <kbd>.h</kbd> halant.",
  "harvard-kyoto": "Harvard-Kyoto in plain ASCII: <kbd>dharmakSetre</kbd> → धर्मक्षेत्रे, <kbd>zivaH</kbd> → शिवः.",
  inscript: "INSCRIPT: each key types one letter or sign (k क, d ्, e ा). Shift for the second row of letters.",
  off: "Input conversion is off: use your own Devanagari keyboard, or paste text to see it in Nagosi.",
};

function renderSuggestions(state = input.state) {
  const { buffer, composing, suggestions } = state;
  suggestEl.replaceChildren();
  if (!buffer) {
    const p = document.createElement("span");
    p.className = "empty";
    p.textContent = schemeSel.value === "off" || schemeSel.value === "inscript"
      ? "Suggestions appear while typing in a romanized input."
      : "Start typing: suggestions from the " + (langSel.value === "ne" ? "Nepali" : "Sanskrit") + " dictionary show here.";
    suggestEl.append(p);
    return;
  }
  const cur = document.createElement("span");
  cur.className = "composing";
  cur.textContent = composing || buffer;
  cur.lang = langSel.value;
  suggestEl.append(cur);
  suggestions.forEach((w, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.lang = langSel.value;
    if (i === 0) {
      const k = document.createElement("span");
      k.className = "k";
      k.textContent = "Tab";
      b.append(k);
    }
    b.append(w);
    b.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus in the textarea
    b.addEventListener("click", () => input.choose(w));
    suggestEl.append(b);
  });
}

const input = new NagosiInput(text, {
  scheme: "nepali-roman",
  suggester: dictionaries.ne,
  onChange: (st) => renderSuggestions(st),
});
const kbd = new OnScreenKeyboard($("kbd"), input);
$<HTMLButtonElement>("kbd-toggle").addEventListener("click", (e) => {
  const box = $("kbd");
  box.hidden = !box.hidden;
  (e.currentTarget as HTMLButtonElement).setAttribute("aria-expanded", String(!box.hidden));
  (e.currentTarget as HTMLButtonElement).textContent = box.hidden ? "Show keyboard" : "Hide keyboard";
});

let saveTimer = 0;
function afterEdit() {
  romanEl.textContent = toRoman(text.value.slice(0, 400), iast).replace(/\s+/g, " ").trim();
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => store.set("text", text.value), 400);
}
text.addEventListener("input", afterEdit);

// ------------------------------------------------------------------ controls
function features() {
  const on = ["ss01", "ss02", "ss03"].filter((f) => ($<HTMLInputElement>(f)).checked);
  return on.length ? on.map((f) => `"${f}"`).join(", ") : "normal";
}

function applyStyle() {
  $("wght-out").textContent = wght.value;
  $("size-out").textContent = size.value;
  const feat = features();
  text.style.fontWeight = wght.value;
  text.style.fontSize = size.value + "px";
  text.style.fontFeatureSettings = feat;
  text.lang = langSel.value;
  document.querySelectorAll<HTMLElement>(".grid, .charset, .big").forEach((el) => {
    el.style.fontWeight = wght.value;
    el.style.fontFeatureSettings = feat;
  });
  hint.innerHTML = HINTS[schemeSel.value];
  for (const k of ["scheme", "lang", "wght", "size"]) store.set(k, ($<HTMLInputElement>(k)).value);
  for (const f of ["ss01", "ss02", "ss03"]) store.set(f, String(($<HTMLInputElement>(f)).checked));
}

schemeSel.addEventListener("change", () => {
  input.setScheme(schemeSel.value as SchemeId);
  kbd.setLayout(schemeSel.value === "inscript" ? "inscript" : "roman");
  applyStyle();
  renderSuggestions();
  text.focus();
});
langSel.addEventListener("change", () => {
  input.setSuggester(dictionaries[langSel.value]);
  applyStyle();
  renderSuggestions();
});
for (const el of [wght, size, $("ss01"), $("ss02"), $("ss03")]) el.addEventListener("input", applyStyle);

async function copy(value: string, btn: HTMLButtonElement, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    btn.textContent = "Copied";
  } catch {
    btn.textContent = "Select and copy";
  }
  setTimeout(() => (btn.textContent = label), 1500);
}
$<HTMLButtonElement>("copy").addEventListener("click", (e) => {
  input.reset();
  copy(text.value, e.currentTarget as HTMLButtonElement, "Copy text");
});
$<HTMLButtonElement>("clear").addEventListener("click", () => {
  input.reset();
  text.value = "";
  afterEdit();
  text.focus();
});

// ------------------------------------------------------------------ specimen sections
const SAMPLE_NE = "नमस्ते! म नगोसी हुँ — नेपाली र संस्कृत दुवैका लागि बनेको अक्षर।\nसर्वे भवन्तु सुखिनः सर्वे सन्तु निरामयाः।";
const WATERFALL = "सर्वे भवन्तु सुखिनः · षड्गुण · Ṛgveda";

function buildWaterfall() {
  const box = $("waterfall");
  for (let w = 100; w <= 900; w += 100) {
    const row = document.createElement("div");
    row.className = "row";
    const n = document.createElement("span");
    n.className = "n";
    n.textContent = String(w);
    const t = document.createElement("span");
    t.className = "t";
    t.style.fontWeight = String(w);
    t.textContent = WATERFALL;
    row.append(n, t);
    box.append(row);
  }
}

function buildStacks() {
  const grid = $("stacks");
  const lines = (stacksTxt as string).split("\n").filter(Boolean);
  $("stack-count").textContent = String(lines.length);
  for (const line of lines) {
    const cluster = line.split("\t")[0];
    const cell = document.createElement("div");
    cell.className = "cell";
    const g = document.createElement("span");
    g.className = "g";
    g.textContent = cluster;
    const s = document.createElement("span");
    s.className = "s";
    s.textContent = [...cluster].filter((c) => c !== "्").join("+");
    cell.append(g, s);
    grid.append(cell);
  }
}

function buildCharset() {
  const sets: [string, string][] = [
    ["Vowels", "अ आ इ ई उ ऊ ऋ ॠ ऌ ॡ ए ऐ ओ औ ॲ ऑ"],
    ["Consonants", "क ख ग घ ङ च छ ज झ ञ ट ठ ड ढ ण त थ द ध न प फ ब भ म य र ल ळ व श ष स ह क्ष त्र ज्ञ श्र"],
    ["Signs", "का कि की कु कू कृ कॄ के कै को कौ कं कँ कः क् ऽ ॐ । ॥ ॰"],
    ["Digits", "० १ २ ३ ४ ५ ६ ७ ८ ९   0 1 2 3 4 5 6 7 8 9"],
    ["Vedic", "क॑ क॒ क᳚ क᳛ कꣳ कꣴ"],
    ["Latin and IAST", "Aa Ā ā Ī ī Ū ū Ṛ ṛ Ṝ ṝ Ḷ ḷ Ṃ ṃ Ḥ ḥ Ṅ ṅ Ñ ñ Ṭ ṭ Ḍ ḍ Ṇ ṇ Ś ś Ṣ ṣ"],
  ];
  const box = $("charset");
  for (const [name, chars] of sets) {
    const set = document.createElement("div");
    set.className = "set";
    const l = document.createElement("span");
    l.className = "lbl";
    l.textContent = name;
    const c = document.createElement("div");
    c.className = "chars";
    c.lang = "sa";
    c.textContent = chars;
    set.append(l, c);
    box.append(set);
  }
}

const CSS_SNIPPET = `<link rel="stylesheet"
  href="https://cdn.jsdelivr.net/gh/sushilldhakal/font-keyboard@v1.0.0/cdn/nagosi.css">

<style>
  body { font-family: "Nagosi", serif; }
  /* optional */
  .nepali   { font-feature-settings: "ss01"; }        /* झ ५ ८ ९ */
  .sanskrit { font-feature-settings: "ss02", "ss03"; } /* ल श क्त */
</style>`;
$("css-snippet").textContent = CSS_SNIPPET;
$<HTMLButtonElement>("copy-css").addEventListener("click", (e) => copy(CSS_SNIPPET, e.currentTarget as HTMLButtonElement, "Copy CSS"));

// ------------------------------------------------------------------ boot
for (const k of ["scheme", "lang", "wght", "size"]) {
  const v = store.get(k);
  if (v !== null) ($<HTMLInputElement>(k)).value = v;
}
for (const f of ["ss01", "ss02", "ss03"]) ($<HTMLInputElement>(f)).checked = store.get(f) === "true";
if (![...schemeSel.options].some((o) => o.value === schemeSel.value)) schemeSel.value = "nepali-roman";
input.setScheme(schemeSel.value as SchemeId);
input.setSuggester(dictionaries[langSel.value]);
kbd.setLayout(schemeSel.value === "inscript" ? "inscript" : "roman");
text.value = store.get("text") ?? SAMPLE_NE;
buildWaterfall();
buildStacks();
buildCharset();
applyStyle();
renderSuggestions();
afterEdit();
