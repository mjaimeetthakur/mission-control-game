import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

// Bundle from source so this edition includes exactly the same game and reference data.
const root = fileURLToPath(new URL("../", import.meta.url));
const target = join(root, "offline", "Mission Control.html");
const result = await build({
  root,
  base: "./",
  publicDir: false,
  build: {
    write: false,
    sourcemap: false,
    modulePreload: false,
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    rollupOptions: {
      input: join(root, "index.html"),
      output: {
        inlineDynamicImports: true,
        format: "iife",
        name: "MissionControl",
      },
    },
  },
});

const outputs = (Array.isArray(result) ? result : [result]).flatMap(
  (output) => output.output,
);
const chunks = outputs.filter((output) => output.type === "chunk");
const assets = outputs.filter((output) => output.type === "asset");
const index = assets.find((asset) => asset.fileName === "index.html");
const styles = assets.filter((asset) => asset.fileName.endsWith(".css"));
const unbundled = assets.filter(
  (asset) => asset !== index && !styles.includes(asset),
);
if (chunks.length !== 1 || !index || unbundled.length) {
  throw new Error(
    `Offline build needs one entry script and fully embedded assets. Emitted files: ${outputs.map((output) => output.fileName).join(", ")}`,
  );
}

const toText = (source) =>
  typeof source === "string" ? source : new TextDecoder().decode(source);
let html = toText(index.source);
// Vite normally loads its module in the head. Run the bundled script after the root element exists.
html = html.replace(
  /<script\b[^>]*\bsrc=["'][^"']+["'][^>]*>\s*<\/script>/gi,
  "",
);
html = html.replace(/<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi, "");
const css = styles
  .map((asset) => toText(asset.source))
  .join("\n")
  .replace(/<\/style/gi, "<\\/style");
const script = chunks[0].code.replace(/<\/script/gi, "<\\/script");
// Callback replacements preserve literal $ sequences in third-party libraries and shader code.
html = html.replace("</head>", () => `<style>${css}</style>\n</head>`);
html = html.replace("</body>", () => `<script>${script}</script>\n</body>`);

await mkdir(dirname(target), { recursive: true });
const pending = `${target}.tmp`;
await writeFile(pending, html, "utf8");
await rename(pending, target);
console.log(
  `Offline game ready: ${target} (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MiB)`,
);
