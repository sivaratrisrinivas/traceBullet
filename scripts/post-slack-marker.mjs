#!/usr/bin/env node

const token = process.env.SLACK_BOT_TOKEN;
const channel = process.env.TRACEBULLET_SLACK_CHANNEL_ID ?? "C0B689JN3L6";
const text =
  process.argv.slice(2).join(" ") || "Merged PR #10 for checkout test error investigation";

if (!token) {
  console.error("Missing SLACK_BOT_TOKEN with chat:write permission.");
  process.exit(1);
}

const response = await fetch("https://slack.com/api/chat.postMessage", {
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json; charset=utf-8"
  },
  body: JSON.stringify({ channel, text })
});

const body = await response.json();

if (!response.ok || !body.ok) {
  const error = body.error ?? `Slack API request failed with HTTP ${response.status}`;
  const acceptedScopes = response.headers.get("x-accepted-oauth-scopes");
  const providedScopes = response.headers.get("x-oauth-scopes");

  if (error === "missing_scope") {
    console.error(
      [
        "Slack API error: missing_scope.",
        "Add the Bot Token OAuth Scope `chat:write`, reinstall the app to the workspace, and use the new Bot User OAuth Token.",
        acceptedScopes ? `Accepted scopes: ${acceptedScopes}` : undefined,
        providedScopes ? `Provided scopes: ${providedScopes}` : undefined
      ]
        .filter(Boolean)
        .join("\n")
    );
  } else {
    console.error(error);
  }

  process.exit(1);
}

console.log(JSON.stringify({ channel: body.channel, ts: body.ts, text }));
