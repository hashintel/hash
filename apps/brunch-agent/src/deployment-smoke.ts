import { randomUUID } from "node:crypto";

import { brunchEnv, brunchHeaders } from "@hashintel/brunch-agent";

import {
  validatePersistedHistory,
  validateUiMessageStream,
} from "./deployment-smoke-validation.ts";

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`Deployment smoke requires ${name}.`);
  }
  return value;
};

const baseUrl = required(brunchEnv.smokeBaseUrl).replace(/\/$/u, "");
const principal = required(brunchEnv.smokePrincipal);
const mode = process.env[brunchEnv.smokeMode] ?? "turn";
const conversationId =
  mode === "history"
    ? required(brunchEnv.smokeConversationId)
    : process.env[brunchEnv.smokeConversationId]?.trim() || randomUUID();
const requestId = process.env[brunchEnv.smokeRequestId]?.trim() || randomUUID();
const headers = new Headers({
  "content-type": "application/json",
  [brunchHeaders.principal]: principal,
  "x-request-id": requestId,
});
// A streamed turn legitimately takes tens of seconds; a hung server must still fail the smoke.
const requestTimeout = () => AbortSignal.timeout(120_000);

if (mode === "history") {
  const response = await fetch(
    `${baseUrl}/api/chat?id=${encodeURIComponent(conversationId)}`,
    { headers, signal: requestTimeout() },
  );
  if (!response.ok) {
    throw new Error(`History request failed with HTTP ${response.status}.`);
  }
  const messages = validatePersistedHistory(
    await response.json(),
    required(brunchEnv.smokeExpectedText),
  );
  process.stdout.write(
    `${JSON.stringify({
      conversationId,
      messages,
      ok: true,
    })}\n`,
  );
} else if (mode === "turn") {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers,
    signal: requestTimeout(),
    body: JSON.stringify({
      id: conversationId,
      messages: [
        {
          id: randomUUID(),
          role: "user",
          parts: [
            {
              type: "text",
              text:
                process.env[brunchEnv.smokePrompt] ??
                "Activate the elicitation skill, call ping once, then briefly confirm the restricted deployment path.",
            },
          ],
        },
      ],
      trigger: "submit-message",
    }),
  });
  if (!response.ok || response.body === null) {
    throw new Error(`Streamed turn failed with HTTP ${response.status}.`);
  }

  const { bytes, chunks } = await validateUiMessageStream(response.body, () => {
    process.stdout.write(
      `${JSON.stringify({
        conversationId,
        event: "first-stream-chunk",
        requestId,
      })}\n`,
    );
  });
  process.stdout.write(
    `${JSON.stringify({
      bytes,
      chunks,
      conversationId,
      event: "stream-complete",
      ok: true,
      requestId,
    })}\n`,
  );
} else {
  throw new Error(`${brunchEnv.smokeMode} must be either "turn" or "history".`);
}
