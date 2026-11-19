// Loads the built page in jsdom and types into it the way a browser does (beforeinput events).
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, it } from "vitest";

let win, doc, ta;
const errors = [];

function type(str) {
  for (const ch of str) {
    const ev = new win.InputEvent("beforeinput", { inputType: ch === "\n" ? "insertLineBreak" : "insertText", data: ch === "\n" ? null : ch, cancelable: true, bubbles: true });
    if (ta.dispatchEvent(ev)) { // not prevented: browser default
      ta.setRangeText(ch, ta.selectionStart, ta.selectionEnd, "end");
    }
  }
}
function backspace() {
  const ev = new win.InputEvent("beforeinput", { inputType: "deleteContentBackward", cancelable: true, bubbles: true });
  if (ta.dispatchEvent(ev)) ta.setRangeText("", Math.max(0, ta.selectionStart - 1), ta.selectionEnd, "end");
}

beforeAll(() => {
  const html = readFileSync(new URL("../dist/index.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true, virtualConsole: undefined });
  win = dom.window;
  win.addEventListener("error", (e) => errors.push(e.message));
  doc = win.document;
  ta = doc.getElementById("text");
});

describe("Nagosi Type Studio", () => {
  it("boots without script errors and fills the specimen", () => {
    expect(errors).toEqual([]);
    expect(doc.title).toBe("Nagosi Type Studio");
    expect(doc.querySelectorAll("#stacks .cell").length).toBeGreaterThan(150);
    expect(doc.querySelectorAll("#waterfall .row").length).toBe(9);
    expect(ta.value).toContain("नमस्ते");
  });
  it("types Romanized Nepali with live composition, backspace and suggestions", () => {
    ta.value = "";
    ta.setSelectionRange(0, 0);
    type("namast");
    expect(ta.value).toBe("नमस्त");
    backspace();
    expect(ta.value).toBe("नमस");
    type("te");
    expect(ta.value).toBe("नमस्ते");
    type(" saba");
    expect(doc.querySelector("#suggest .composing").textContent).toBe("सब");
    expect([...doc.querySelectorAll("#suggest button")].map((b) => b.textContent.replace("Tab", ""))).toContain("सबै");
    type("i ");
    expect(ta.value).toBe("नमस्ते सबै ");
  });
  it("switches to IAST", () => {
    const sel = doc.getElementById("scheme");
    sel.value = "iast";
    sel.dispatchEvent(new win.Event("change"));
    ta.value = "";
    ta.setSelectionRange(0, 0);
    type("dharmakṣetre kurukṣetre |");
    expect(ta.value).toBe("धर्मक्षेत्रे कुरुक्षेत्रे ।");
  });
  it("on-screen keyboard types into the field", () => {
    const sel = doc.getElementById("scheme");
    sel.value = "nepali-roman";
    sel.dispatchEvent(new win.Event("change"));
    doc.getElementById("kbd-toggle").click();
    expect(doc.getElementById("kbd").hidden).toBe(false);
    ta.value = "";
    ta.setSelectionRange(0, 0);
    const key = (c) => [...doc.querySelectorAll(".nagosi-key")].find((b) => b.querySelector(".nagosi-key-sub")?.textContent === c);
    key("k").click(); key("a").click(); key("m").click(); key("a").click(); key("l").click();
    expect(ta.value).toBe("कमल");
  });
  it("no key on the on-screen keyboard types English, with or without Shift", () => {
    for (const scheme of ["nepali-roman", "iast", "itrans", "harvard-kyoto", "inscript"]) {
      const sel = doc.getElementById("scheme");
      sel.value = scheme;
      sel.dispatchEvent(new win.Event("change"));
      for (const shifted of [false, true]) {
        const letters = [...doc.querySelectorAll("#kbd .nagosi-key")].filter((b) => /^[a-z]$/i.test(b.querySelector(".nagosi-key-sub")?.textContent ?? "")).length;
        for (let i = 0; i < letters; i++) {
          ta.value = "";
          ta.setSelectionRange(0, 0);
          if (shifted) doc.querySelector('#kbd .nagosi-key[aria-label="Shift"]').click();
          const keys = [...doc.querySelectorAll("#kbd .nagosi-key")].filter((b) => /^[a-z]$/i.test(b.querySelector(".nagosi-key-sub")?.textContent ?? ""));
          const k = keys[i];
          const label = k.querySelector(".nagosi-key-main").textContent;
          k.click();
          doc.querySelector('#kbd .nagosi-key[aria-label="Space"]').click();
          const out = ta.value.trim();
          expect(out, `${scheme} ${shifted ? "shift+" : ""}${k.querySelector(".nagosi-key-sub").textContent}`).not.toMatch(/[A-Za-z]/);
          if (scheme === "nepali-roman" && !/[\u093E-\u094C\u0902\u0903]/.test(label)) expect(out, "label matches output").toBe(label);
        }
      }
    }
  });
  it("INSCRIPT maps keys directly", () => {
    const sel = doc.getElementById("scheme");
    sel.value = "inscript";
    sel.dispatchEvent(new win.Event("change"));
    ta.value = "";
    ta.setSelectionRange(0, 0);
    type("kdlj");
    expect(ta.value).toBe("क्तर");
  });
});
