import { randomUUID } from "node:crypto";

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

const baseUrl = required("BRUNCH_SMOKE_BASE_URL").replace(/\/$/u, "");
const principal = required("BRUNCH_SMOKE_PRINCIPAL");
const mode = process.env.BRUNCH_SMOKE_MODE ?? "turn";
const conversationId =
  mode === "history"
    ? required("BRUNCH_SMOKE_CONVERSATION_ID")
    : process.env.BRUNCH_SMOKE_CONVERSATION_ID?.trim() || randomUUID();
const requestId = process.env.BRUNCH_SMOKE_REQUEST_ID?.trim() || randomUUID();
const headers = new Headers({
  "content-type": "application/json",
  "x-brunch-principal": principal,
  "x-request-id": requestId,
});
const bearerToken = process.env.BRUNCH_SMOKE_BEARER_TOKEN;
if (bearerToken) headers.set("authorization", `Bearer ${bearerToken}`);

if (mode === "history") {
  const response = await fetch(
    `${baseUrl}/api/chat?id=${encodeURIComponent(conversationId)}`,
    { headers },
  );
  if (!response.ok) {
    throw new Error(`History request failed with HTTP ${response.status}.`);
  }
  const messages = validatePersistedHistory(
    await response.json(),
    required("BRUNCH_SMOKE_EXPECTED_TEXT"),
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
                process.env.BRUNCH_SMOKE_PROMPT ??
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
  throw new Error('BRUNCH_SMOKE_MODE must be either "turn" or "history".');
}
