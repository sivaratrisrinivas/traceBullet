#!/usr/bin/env node
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  handleAppHealth,
  handleAppInvestigationRequest
} from "../src/appServerCore.ts";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const staticDir = resolve(rootDir, "dist/ui");
const host = process.env.TRACEBULLET_APP_HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.TRACEBULLET_APP_PORT ?? "4180", 10);

const server = createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/api/health") {
      return sendJson(response, handleAppHealth());
    }

    if (request.method === "POST" && request.url === "/api/investigate") {
      const body = await readJsonBody(request);

      return sendJson(response, handleAppInvestigationRequest(body));
    }

    if (request.url?.startsWith("/api/")) {
      return sendJson(response, {
        status: 404,
        body: {
          error: "Unknown TraceBullet API route."
        }
      });
    }

    return serveStatic(request, response);
  } catch (error) {
    return sendJson(response, {
      status: 500,
      body: {
        error: error instanceof Error ? error.message : "TraceBullet app server failed."
      }
    });
  }
});

server.listen(port, host, () => {
  console.error(`TraceBullet app server listening at http://${host}:${port}`);
});

async function readJsonBody(request) {
  let raw = "";

  for await (const chunk of request) {
    raw += chunk;

    if (raw.length > 64 * 1024) {
      throw new Error("Request body too large.");
    }
  }

  return raw.trim() ? JSON.parse(raw) : {};
}

function sendJson(response, result) {
  response.writeHead(result.status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(`${JSON.stringify(result.body, null, 2)}\n`);
}

async function serveStatic(request, response) {
  if (!existsSync(staticDir)) {
    response.writeHead(503, {
      "content-type": "text/plain; charset=utf-8"
    });
    response.end("Build the UI first with npm run ui:build.\n");

    return;
  }

  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const normalizedPath = normalize(decodeURIComponent(requestedPath))
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^[/\\]+/, "");
  const filePath = resolve(join(staticDir, normalizedPath));

  if (!filePath.startsWith(staticDir)) {
    response.writeHead(403);
    response.end();

    return;
  }

  const resolvedPath = existsSync(filePath) && statSync(filePath).isFile()
    ? filePath
    : resolve(staticDir, "index.html");

  response.writeHead(200, {
    "content-type": readContentType(resolvedPath)
  });
  createReadStream(resolvedPath).pipe(response);
}

function readContentType(filePath) {
  const extension = extname(filePath);

  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml"
  }[extension] ?? "application/octet-stream";
}
