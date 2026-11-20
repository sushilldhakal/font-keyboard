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

describe("Vedic Nepali Type Studio", () => {
  it("boots without script errors and fills the specimen", () => {
    expect(errors).toEqual([]);
    expect(doc.title).toBe("Vedic Nepali Type Studio");
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
    expect(doc.querySelector("#suggest button").textContent).not.toBe("");
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
    expect(doc.querySelector("#kbd .vedicnepali-kbd").dataset.layout).toBe("nepali-traditional"); // the default
    doc.querySelector("#kbd .vedicnepali-arrow.next").click(); // space bar › → नेपाली (Roman)
    expect(doc.querySelector("#kbd .switcher .vedicnepali-key-main").textContent).toBe("नेपाली (Roman)");
    ta.value = "";
    ta.setSelectionRange(0, 0);
    const key = (c) => [...doc.querySelectorAll(".vedicnepali-key")].find((b) => b.querySelector(".vedicnepali-key-sub")?.textContent === c);
    key("k").click(); key("a").click(); key("m").click(); key("a").click(); key("l").click();
    expect(ta.value).toBe("कमल");
  });
  it("no key on the on-screen keyboard types English, with or without Shift", () => {
    for (const scheme of ["nepali-roman", "iast", "itrans", "harvard-kyoto", "inscript"]) {
      const sel = doc.getElementById("scheme");
      sel.value = scheme;
      sel.dispatchEvent(new win.Event("change"));
      for (const shifted of [false, true]) {
        const letters = [...doc.querySelectorAll("#kbd .vedicnepali-key")].filter((b) => /^[a-z]$/i.test(b.querySelector(".vedicnepali-key-sub")?.textContent ?? "")).length;
        for (let i = 0; i < letters; i++) {
          ta.value = "";
          ta.setSelectionRange(0, 0);
          if (shifted) doc.querySelector('#kbd .vedicnepali-key[aria-label="Shift"]').click();
          const keys = [...doc.querySelectorAll("#kbd .vedicnepali-key")].filter((b) => /^[a-z]$/i.test(b.querySelector(".vedicnepali-key-sub")?.textContent ?? ""));
          const k = keys[i];
          const label = k.querySelector(".vedicnepali-key-main").textContent;
          k.click();
          doc.querySelector('#kbd .vedicnepali-key.space .vedicnepali-key-main').click();
          const out = ta.value.trim();
          expect(out, `${scheme} ${shifted ? "shift+" : ""}${k.querySelector(".vedicnepali-key-sub").textContent}`).not.toMatch(/[A-Za-z]/);
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

describe("typing a name like ढकाल, three ways", () => {
  const setScheme = (v) => {
    const sel = doc.getElementById("scheme");
    sel.value = v;
    sel.dispatchEvent(new win.Event("change"));
  };
  const clear = () => {
    ta.value = "";
    ta.setSelectionRange(0, 0);
  };
  const chips = () => [...doc.querySelectorAll("#suggest button")].map((b) => b.textContent.replace("Tab", ""));

  it("loosely typed roman: Space picks the dictionary word, Backspace undoes it", () => {
    setScheme("nepali-roman");
    clear();
    type("mero naam sushil dhakal ho ");
    expect(ta.value).toBe("मेरो नाम सुशील ढकाल हो ");
    clear();
    type("dhakal");
    expect(ta.value).toBe("धकल");
    expect(chips()[0]).toBe("ढकाल");
    type(" ");
    expect(ta.value).toBe("ढकाल ");
    backspace();
    expect(ta.value).toBe("धकल"); // what was typed, still composing
    type(" ");
    expect(ta.value).toBe("धकल "); // the user's own spelling is kept this time
  });

  it("holding an on-screen key offers ढ", () => {
    setScheme("nepali-roman");
    if (doc.getElementById("kbd").hidden) doc.getElementById("kbd-toggle").click();
    clear();
    const key = (c) => [...doc.querySelectorAll("#kbd .vedicnepali-key")].find((b) => b.querySelector(".vedicnepali-key-sub")?.textContent === c);
    key("d").dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    const pop = doc.querySelector("#kbd .vedicnepali-pop");
    expect([...pop.querySelectorAll(".vedicnepali-key-main")].map((m) => m.textContent)).toEqual(["ध", "ड", "ढ"]);
    [...pop.querySelectorAll(".vedicnepali-key")].find((b) => b.textContent.startsWith("ढ")).click();
    key("a").click(); key("k").click();
    key("a").dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    doc.querySelector("#kbd .vedicnepali-pop .vedicnepali-key").click(); // आ ा
    key("l").click();
    expect(ta.value).toBe("ढकाल");
  });

  it("the Nepali traditional keys: tap for the letter, hold or Shift for the corner letter", () => {
    clear();
    const kbdKey = (t) => [...doc.querySelectorAll("#kbd .vedicnepali-key")].find((b) => b.querySelector(".vedicnepali-key-main")?.textContent === t);
    const goTo = (label) => {
      for (let i = 0; i < 6 && doc.querySelector("#kbd .switcher .vedicnepali-key-main").textContent !== label; i++) doc.querySelector("#kbd .vedicnepali-arrow.next").click();
      expect(doc.querySelector("#kbd .switcher .vedicnepali-key-main").textContent).toBe(label);
    };
    goTo("नेपाली");
    expect(doc.querySelector("#kbd .vedicnepali-kbd").dataset.layout).toBe("nepali-traditional");
    const rows = [...doc.querySelectorAll("#kbd .vedicnepali-row")].map((r) => [...r.querySelectorAll(".vedicnepali-key.phone .vedicnepali-key-main")].map((m) => m.textContent).join(""));
    expect(rows.slice(0, 4)).toEqual(["ञघङझछटठडढण्", "धभचतथगषयउृे", "बकमानजवपिसु", "शहअखदलफ,र"]);
    for (const t of ["ढ", "क", "ा"]) kbdKey(t).click();
    expect(chips()).toContain("ढकाल");
    kbdKey("ल").click();
    expect(ta.value).toBe("ढकाल");
    doc.querySelector('#kbd .vedicnepali-key.space .vedicnepali-key-main').click();
    // hold क → क्ष; ⇧ then ि → ी
    kbdKey("क").dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    kbdKey("ि").dispatchEvent(new win.MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    expect(ta.value).toBe("ढकाल क्षी");
    kbdKey("⇧").click();
    expect(kbdKey("त्र")).toBeTruthy(); // Shift shows the corner letters
    kbdKey("त्र").click();
    expect(ta.value).toBe("ढकाल क्षीत्र");
    kbdKey("१२३").click();
    kbdKey("५").click();
    expect(ta.value).toBe("ढकाल क्षीत्र५");
    kbdKey("कख").click();
    // वैदिक: vowels, varga consonants, svara marks; ⇧ turns vowels into signs
    goTo("वैदिक");
    expect(doc.getElementById("lang").value).toBe("sa");
    const vrows = [...doc.querySelectorAll("#kbd .vedicnepali-row")].map((r) => [...r.querySelectorAll(".vedicnepali-key.phone .vedicnepali-key-main")].map((m) => m.textContent).join(" "));
    expect(vrows[0]).toBe("अं अ आ क च ट त प य श");
    expect(vrows[4]).toBe("ᳵ ३ ङ ञ ण न म ॐ");
    clear();
    kbdKey("ग").click();
    kbdKey("⇧").click();
    kbdKey("ि").click(); // shifted इ
    kbdKey("र").click();
    kbdKey("॑").click(); // udatta
    expect(ta.value).toBe("गिर॑");
    // ‹ goes back; IAST is a roman keyboard
    goTo("Sanskrit (IAST)");
    expect(doc.getElementById("scheme").value).toBe("iast");
    doc.querySelector("#kbd .vedicnepali-arrow.prev").click();
    expect(doc.querySelector("#kbd .switcher .vedicnepali-key-main").textContent).toBe("वैदिक");
    goTo("नेपाली (Roman)");
    expect(doc.getElementById("scheme").value).toBe("nepali-roman");
    expect(doc.getElementById("lang").value).toBe("ne");
  });
});
