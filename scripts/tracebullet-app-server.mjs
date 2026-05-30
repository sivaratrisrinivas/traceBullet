#!/usr/bin/env node
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  handleAppHealth,
  handleAppInvestigationRequest
} from "../src/appServerCore.ts";

const rootDir = resolve(fileURLToPath(new URL("..", import.meta.url)));
const dotenvResult = loadDotenv(resolve(rootDir, ".env"));

const staticDir = resolve(rootDir, "dist/ui");
const host = process.env.TRACEBULLET_APP_HOST ?? (process.env.RENDER ? "0.0.0.0" : "127.0.0.1");
const port = Number.parseInt(process.env.TRACEBULLET_APP_PORT ?? process.env.PORT ?? "4180", 10);

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
  console.error(
    JSON.stringify({
      at: new Date().toISOString(),
      component: "tracebullet-app",
      message: "app.env.loaded",
      path: dotenvResult.path,
      found: dotenvResult.found,
      loadedKeys: dotenvResult.loadedKeys,
      skippedExistingKeys: dotenvResult.skippedExistingKeys,
      hasGeminiApiKey: Boolean(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY),
      narrativeProvider: process.env.TRACEBULLET_NARRATIVE_PROVIDER ?? "ollama",
      narrativeMode: process.env.TRACEBULLET_NARRATIVE_MODE ?? "llm-with-deterministic-fallback",
      geminiModel: process.env.TRACEBULLET_GEMINI_MODEL
    })
  );
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

function loadDotenv(filePath) {
  const result = {
    path: filePath,
    found: existsSync(filePath),
    loadedKeys: [],
    skippedExistingKeys: []
  };

  if (!existsSync(filePath)) {
    return result;
  }

  const content = readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/u)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed
      .slice(0, separatorIndex)
      .trim()
      .replace(/^export\s+/u, "");
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    if (!key) {
      continue;
    }

    if (process.env[key] !== undefined && process.env[key] !== "") {
      result.skippedExistingKeys.push(key);
      continue;
    }

    process.env[key] = unquoteDotenvValue(rawValue);
    result.loadedKeys.push(key);
  }

  return result;
}

function unquoteDotenvValue(value) {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
