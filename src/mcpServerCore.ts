import { runTraceBulletCommand } from "./cli.ts";

const serverInfo = {
  name: "tracebullet",
  version: "0.1.0"
};

const tools = [
  {
    name: "tracebullet_investigate",
    description:
      "Investigate a Sentry Issue ID and return TraceBullet's Machine Report or Deterministic Report.",
    inputSchema: {
      type: "object",
      properties: {
        sentryIssueId: {
          type: "string",
          description: "The Sentry Issue ID to investigate, for example CHECKOUT-4."
        },
        source: {
          type: "string",
          enum: ["local", "coral"],
          description: "Use local prototype data or Coral sandbox sources."
        },
        includeEnrichment: {
          type: "boolean",
          description: "Attach optional Datadog/PagerDuty Operational Enrichment."
        },
        includeNarrative: {
          type: "boolean",
          description: "Attach a local Ollama narrative, falling back to deterministic text."
        },
        outputFormat: {
          type: "string",
          enum: ["json", "text"],
          description: "Return the Machine Report JSON or human-readable Deterministic Report."
        }
      },
      required: ["sentryIssueId"],
      additionalProperties: false
    }
  }
];

export function handleMcpMessage(message: Record<string, unknown>) {
  if (!Object.hasOwn(message, "id")) {
    return undefined;
  }

  try {
    switch (message.method) {
      case "initialize":
        return result(message.id, {
          protocolVersion:
            readObject(message.params).protocolVersion ?? "2025-06-18",
          capabilities: {
            tools: {}
          },
          serverInfo
        });
      case "tools/list":
        return result(message.id, { tools });
      case "tools/call":
        return result(message.id, callTool(readObject(message.params)));
      default:
        return error(message.id, -32601, `Unknown method: ${String(message.method)}`);
    }
  } catch (caught) {
    return error(message.id, -32603, readErrorMessage(caught));
  }
}

function callTool(params: Record<string, unknown>) {
  const name = params.name;
  const args = readObject(params.arguments);

  if (name !== "tracebullet_investigate") {
    throw new Error(`Unknown tool: ${String(name)}`);
  }

  if (typeof args.sentryIssueId !== "string" || args.sentryIssueId.length === 0) {
    throw new Error("tracebullet_investigate requires sentryIssueId.");
  }

  const source = args.source === "coral" ? "coral" : "local";
  const outputFormat = args.outputFormat === "text" ? "text" : "json";
  const commandArgs = ["investigate", args.sentryIssueId, "--source", source];

  if (outputFormat === "json") {
    commandArgs.push("--json");
  }

  if (args.includeEnrichment) {
    commandArgs.push("--enrich");
  }

  if (args.includeNarrative) {
    commandArgs.push("--narrative");
  }

  const commandResult = runTraceBulletCommand(commandArgs);

  if (commandResult.exitCode !== 0) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: commandResult.stderr || "TraceBullet investigation failed."
        }
      ]
    };
  }

  return {
    content: [
      {
        type: "text",
        text: commandResult.stdout
      }
    ]
  };
}

function result(id: unknown, value: unknown) {
  return {
    jsonrpc: "2.0",
    id,
    result: value
  };
}

function error(id: unknown, code: number, message: string) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message
    }
  };
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown MCP server error.";
}
