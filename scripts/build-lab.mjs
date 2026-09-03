// Build script — bundles the web lab into dist/ as static output.
// Production deploys and the preview both run `node scripts/build-lab.mjs`;
// it must exit, never serve (serving is the preview command's job).

import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const webDir = join(root, "..", "src", "web");
const outDir = join(root, "..", "dist");

mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [join(webDir, "main.ts")],
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2022",
  outfile: join(outDir, "main.js"),
  // The engine is pure TypeScript with no runtime dependencies — the bundle is
  // self-contained. No sourcemaps in production output to keep it lean.
  sourcemap: false,
  logLevel: "info",
});

// Static assets.
cpSync(join(webDir, "index.html"), join(outDir, "index.html"));
cpSync(join(webDir, "style.css"), join(outDir, "style.css"));

// Tiny build stamp so a deployed artifact is identifiable (provenance, §12.34).
const stamp = {
  builtAt: new Date().toISOString(),
  model: "nu-core-v2",
};
writeFileSync(join(outDir, "build.json"), JSON.stringify(stamp, null, 2));

console.log("lab built → dist/");
