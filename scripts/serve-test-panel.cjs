#!/usr/bin/env node
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const port = Number(process.env.PORT || 9520);
const host = process.env.HOST || "0.0.0.0";
const upstreamHost = process.env.CHAT_API_HOST || "127.0.0.1";
const upstreamPort = Number(process.env.CHAT_API_PORT || 9510);
const distDir = path.resolve(process.env.DIST_DIR || path.join(__dirname, "..", "dist"));

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"]
]);

const shouldProxy = (url) => url.startsWith("/api/") || url.startsWith("/socket.io/");

const sendNotFound = (res) => {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
};

const sendStatic = (req, res) => {
  const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const requestedPath = decodeURIComponent(parsedUrl.pathname);
  const safePath = path
    .normalize(requestedPath)
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^[/\\]+/, "");
  const filePath = path.join(distDir, safePath || "index.html");
  const resolvedPath = fs.existsSync(filePath) && fs.statSync(filePath).isFile()
    ? filePath
    : path.join(distDir, "index.html");

  if (!resolvedPath.startsWith(distDir)) {
    sendNotFound(res);
    return;
  }

  fs.createReadStream(resolvedPath)
    .on("error", () => sendNotFound(res))
    .once("open", () => {
      const extension = path.extname(resolvedPath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": mimeTypes.get(extension) || "application/octet-stream",
        "Cache-Control": "no-store"
      });
    })
    .pipe(res);
};

const proxyHttp = (req, res) => {
  const proxyReq = http.request(
    {
      hostname: upstreamHost,
      port: upstreamPort,
      path: req.url,
      method: req.method,
      headers: {
        ...req.headers,
        host: `${upstreamHost}:${upstreamPort}`
      }
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );

  proxyReq.on("error", () => {
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: { code: "chat_api_unavailable" } }));
  });

  req.pipe(proxyReq);
};

const proxyUpgrade = (req, socket, head) => {
  if (!req.url || !shouldProxy(req.url)) {
    socket.destroy();
    return;
  }

  const upstream = net.connect(upstreamPort, upstreamHost, () => {
    upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);

    for (const [key, value] of Object.entries({
      ...req.headers,
      host: `${upstreamHost}:${upstreamPort}`
    })) {
      if (Array.isArray(value)) {
        for (const item of value) {
          upstream.write(`${key}: ${item}\r\n`);
        }
      } else if (value !== undefined) {
        upstream.write(`${key}: ${value}\r\n`);
      }
    }

    upstream.write("\r\n");
    if (head.length > 0) {
      upstream.write(head);
    }

    upstream.pipe(socket);
    socket.pipe(upstream);
  });

  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
};

const server = http.createServer((req, res) => {
  if (req.url && shouldProxy(req.url)) {
    proxyHttp(req, res);
    return;
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    sendNotFound(res);
    return;
  }

  sendStatic(req, res);
});

server.on("upgrade", proxyUpgrade);
server.listen(port, host, () => {
  console.log(`AcessaNet Atendimento test server listening on http://${host}:${port}`);
});
