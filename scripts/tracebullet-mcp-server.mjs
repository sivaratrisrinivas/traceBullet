#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { handleMcpMessage } from "../src/mcpServerCore.ts";

let stdinBuffer = "";

if (process.env.TRACEBULLET_MCP_BATCH_MODE === "true") {
  const input = process.env.TRACEBULLET_MCP_BATCH_FILE
    ? readFileSync(process.env.TRACEBULLET_MCP_BATCH_FILE, "utf8")
    : readFileSync(0, "utf8");

  for (const line of input.split("\n")) {
    handleLine(line);
  }
} else {
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    stdinBuffer += chunk;

    for (;;) {
      const newlineIndex = stdinBuffer.indexOf("\n");

      if (newlineIndex < 0) {
        break;
      }

      const line = stdinBuffer.slice(0, newlineIndex);
      stdinBuffer = stdinBuffer.slice(newlineIndex + 1);
      handleLine(line);
    }
  });

  process.stdin.on("end", () => {
    if (stdinBuffer.trim()) {
      handleLine(stdinBuffer);
    }
  });

  process.stdin.resume();
}

function handleLine(line) {
  if (!line.trim()) {
    return;
  }

  try {
    const response = handleMcpMessage(JSON.parse(line));

    if (response) {
      writeMessage(response);
    }
  } catch {
    writeMessage({
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32700,
        message: "Parse error"
      }
    });
  }
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}
