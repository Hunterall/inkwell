// Standalone Node.js server wrapper for the Nitro build.
// Patches Request.prototype.ip so Nitro's augmentReq can set it in Node.js.
try {
  Object.defineProperty(Request.prototype, "ip", {
    get() { return this._ip; },
    set(v) { this._ip = v; },
    configurable: true,
  });
} catch (_) {}

import { createServer } from "node:http";
import nitroHandler from "./.output/server/index.mjs";

const PORT = 4173;

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const webReq = new Request(url, {
      method: req.method,
      headers: req.headers,
      ...(req.method !== "GET" && req.method !== "HEAD"
        ? { body: await new Promise((resolve, reject) => {
            const chunks = [];
            req.on("data", (c) => chunks.push(c));
            req.on("end", () => resolve(Buffer.concat(chunks)));
            req.on("error", reject);
          }) }
        : {}),
    });

    const webRes = await nitroHandler.fetch(webReq, { ASSETS: undefined }, { waitUntil: () => {} });

    res.writeHead(webRes.status, webRes.statusText, Object.fromEntries(webRes.headers.entries()));
    const body = await webRes.arrayBuffer();
    res.end(Buffer.from(body));
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal Server Error");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Inkwell preview running at http://127.0.0.1:${PORT}/`);
});
