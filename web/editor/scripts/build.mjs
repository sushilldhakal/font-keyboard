// Bundle src/app.ts and inline it, the CSS and the Vedic Nepali variable WOFF2 into one HTML file:
// dist/index.html works offline, on any static host, and as a Claude artifact.
import * as esbuild from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(here, "..", "..");
const watch = process.argv.includes("--watch");

async function build() {
  const js = await esbuild.build({
    entryPoints: [join(here, "src", "app.ts")],
    bundle: true, minify: true, format: "iife", target: "es2020", write: false,
    loader: { ".json": "json", ".txt": "text" },
  });
  const font = readFileSync(join(root, "cdn", "fonts", "VedicNepali-Variable.woff2")).toString("base64");
  const css = (readFileSync(join(root, "web", "keyboard", "src", "keyboard.css"), "utf8") + readFileSync(join(here, "src", "style.css"), "utf8"))
    .replace("__VEDICNEPALI_WOFF2__", `data:font/woff2;base64,${font}`);
  const html = readFileSync(join(here, "src", "index.html"), "utf8")
    .replace("/*__CSS__*/", () => css)
    .replace("/*__JS__*/", () => js.outputFiles[0].text.replace(/<\/script/gi, "<\\/script"));
  mkdirSync(join(here, "dist"), { recursive: true });
  // artifact.html: page body only (the Claude artifact host adds the document skeleton).
  // index.html: a complete document for any static host.
  writeFileSync(join(here, "dist", "artifact.html"), html);
  const full = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n` +
    html.replace(/<\/style>\n/, "</style>\n</head>\n<body>\n") + "</body>\n</html>\n";
  writeFileSync(join(here, "dist", "index.html"), full);
  console.log(`dist/index.html ${(full.length / 1024).toFixed(0)} KB (+ dist/artifact.html)`);
}
await build();
if (watch) {
  const { watch: fsWatch } = await import("node:fs");
  fsWatch(join(here, "src"), { recursive: true }, () => build().catch(console.error));
}
