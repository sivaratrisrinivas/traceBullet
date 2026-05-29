import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runTraceBulletCommand } from "./cli.ts";

const protocolVersion = "2025-06-18";
const serverInfo = {
  name: "tracebullet",
  version: "0.1.0"
};
const textMimeType = "text/plain";

const toolOutputSchema = {
  type: "object",
  properties: {
    report: {
      type: "object"
    }
  },
  required: ["report"]
};

const tools = [
  {
    name: "tracebullet_investigate",
    title: "Investigate Sentry Issue",
    description:
      "Run TraceBullet's Investigation Command for one Sentry Issue ID. Returns a Machine Report as structuredContent and serialized JSON or text in content.",
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
          description: "Use Local Prototype Data or Coral Sandbox Sources."
        },
        includeEnrichment: {
          type: "boolean",
          description: "Attach optional Datadog/PagerDuty Operational Enrichment."
        },
        includeNarrative: {
          type: "boolean",
          description: "Attach a Local LLM Narrative, falling back to deterministic text."
        },
        outputFormat: {
          type: "string",
          enum: ["json", "text"],
          description: "Return serialized Machine Report JSON or human-readable Deterministic Report."
        }
      },
      required: ["sentryIssueId"],
      additionalProperties: false
    },
    outputSchema: toolOutputSchema,
    annotations: {
      title: "Investigate Sentry Issue",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true
    }
  }
];

const resources = [
  {
    uri: "tracebullet://context/domain",
    name: "TraceBullet Domain Language",
    title: "TraceBullet Domain Language",
    description: "Canonical TraceBullet terms and boundaries from CONTEXT.md.",
    mimeType: textMimeType
  },
  {
    uri: "tracebullet://docs/demo-readiness",
    name: "TraceBullet Demo Readiness",
    title: "TraceBullet Demo Readiness",
    description: "Live-vs-synthetic boundaries and demo script.",
    mimeType: textMimeType
  },
  {
    uri: "tracebullet://docs/agent-tool",
    name: "TraceBullet Agent Tool",
    title: "TraceBullet Agent Tool",
    description: "MCP server and JSON adapter usage.",
    mimeType: textMimeType
  }
];

const prompts = [
  {
    name: "tracebullet_investigation_brief",
    title: "TraceBullet Investigation Brief",
    description:
      "Guide an agent to investigate one Sentry Issue ID without overclaiming root cause.",
    arguments: [
      {
        name: "sentryIssueId",
        description: "The Sentry Issue ID to investigate.",
        required: true
      },
      {
        name: "source",
        description: "Use local or coral.",
        required: false
      }
    ]
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
          protocolVersion: readObject(message.params).protocolVersion ?? protocolVersion,
          capabilities: {
            tools: {
              listChanged: false
            },
            resources: {},
            prompts: {}
          },
          serverInfo
        });
      case "ping":
        return result(message.id, {});
      case "tools/list":
        return result(message.id, { tools });
      case "tools/call":
        return result(message.id, callTool(readObject(message.params)));
      case "resources/list":
        return result(message.id, { resources });
      case "resources/read":
        return result(message.id, readResource(readObject(message.params)));
      case "prompts/list":
        return result(message.id, { prompts });
      case "prompts/get":
        return result(message.id, getPrompt(readObject(message.params)));
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
  const commandArgs = ["investigate", args.sentryIssueId, "--source", source, "--json"];

  if (args.includeEnrichment) {
    commandArgs.push("--enrich");
  }

  if (args.includeNarrative) {
    commandArgs.push("--narrative");
  }

  const jsonResult = runTraceBulletCommand(commandArgs);

  if (jsonResult.exitCode !== 0) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: jsonResult.stderr || "TraceBullet investigation failed."
        }
      ]
    };
  }

  const report = JSON.parse(jsonResult.stdout);
  const contentText =
    outputFormat === "text"
      ? runTraceBulletCommand(commandArgs.filter((arg) => arg !== "--json")).stdout
      : jsonResult.stdout;

  return {
    content: [
      {
        type: "text",
        text: contentText
      }
    ],
    structuredContent: {
      report
    },
    isError: false
  };
}

function readResource(params: Record<string, unknown>) {
  const uri = params.uri;

  if (typeof uri !== "string") {
    throw new Error("resources/read requires uri.");
  }

  const filePath = {
    "tracebullet://context/domain": "../CONTEXT.md",
    "tracebullet://docs/demo-readiness": "../docs/demo-readiness.md",
    "tracebullet://docs/agent-tool": "../docs/agent-tool.md"
  }[uri];

  if (!filePath) {
    throw new Error(`Unknown resource: ${uri}`);
  }

  return {
    contents: [
      {
        uri,
        mimeType: textMimeType,
        text: readProjectFile(filePath)
      }
    ]
  };
}

function getPrompt(params: Record<string, unknown>) {
  if (params.name !== "tracebullet_investigation_brief") {
    throw new Error(`Unknown prompt: ${String(params.name)}`);
  }

  const args = readObject(params.arguments);
  const sentryIssueId = typeof args.sentryIssueId === "string" ? args.sentryIssueId : "<SENTRY_ISSUE_ID>";
  const source = args.source === "coral" ? "coral" : "local";

  return {
    description:
      "Investigate one Sentry Issue ID with TraceBullet and explain the result using canonical domain language.",
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: [
            `Investigate ${sentryIssueId} using source=${source}.`,
            "Call tracebullet_investigate with includeNarrative=true and includeEnrichment=true.",
            "Use the term Suspected Causing PR, not root cause.",
            "Treat Narrative Summary and Operational Enrichment as optional context, not Evidence."
          ].join(" ")
        }
      }
    ]
  };
}

function readProjectFile(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
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
