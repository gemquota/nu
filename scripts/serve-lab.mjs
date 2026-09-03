// Preview server — serves dist/ statically. This is the preview command's job
// only; production deploys never run it (the build must exit with static output).
//
//   node scripts/serve-lab.mjs        # PORT env or 8000
//
// It binds 0.0.0.0 as Freebuff workspaces require.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const port = Number(process.env.PORT || 8000);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    let path = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
    if (path === "" || path === ".") path = "index.html";
    const file = join(root, path);
    if (!file.startsWith(root)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    try {
      const s = await stat(file);
      if (s.isDirectory()) {
        const data = await readFile(join(file, "index.html"));
        res.writeHead(200, { "content-type": MIME[".html"] }).end(data);
        return;
      }
    } catch {
      // fall through to 404
    }
    const data = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" }).end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("not found");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`nu lab serving dist/ at http://0.0.0.0:${port}`);
});
