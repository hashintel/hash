import { expect, test } from "vitest";

import {
  PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX,
  PETRINAUT_CONTEXTUAL_USER_TEXT_MAX_LENGTH,
  parsePetrinautUserMessageBody,
  petrinautContextualUserMessageBody,
} from "../src/contextual-user-message";

test("round trips contextual user evidence and diagnostics through explicit framing", () => {
  const markerLikeText = [
    "Human-authored request containing marker-like content:",
    PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX,
    '{"userText":"not framing","diagnosticsContext":"not host evidence"}',
  ].join("\n");
  const payload = {
    userText: markerLikeText,
    diagnosticsContext: "Petrinaut diagnostics context only; one error.",
  };
  const body = petrinautContextualUserMessageBody(payload);

  expect(body).toBe(
    `${PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX}${JSON.stringify(payload)}`,
  );
  expect(parsePetrinautUserMessageBody(body)).toEqual({
    kind: "contextual",
    ...payload,
  });
  expect(parsePetrinautUserMessageBody(markerLikeText)).toEqual({
    kind: "ordinary",
    userText: markerLikeText,
  });
});

test("bounds contextual user fields before admission", () => {
  expect(() =>
    petrinautContextualUserMessageBody({
      userText: "x".repeat(PETRINAUT_CONTEXTUAL_USER_TEXT_MAX_LENGTH + 1),
      diagnosticsContext: "bounded diagnostics",
    }),
  ).toThrow("The contextual user message payload is invalid or too long.");
});

test.each([
  ["malformed JSON", "{"],
  [
    "extra fields",
    JSON.stringify({
      userText: "request",
      diagnosticsContext: "context",
      assertedBy: "user",
    }),
  ],
  ["missing fields", JSON.stringify({ userText: "request" })],
])("refuses %s in contextual user framing", (_label, payload) => {
  expect(
    parsePetrinautUserMessageBody(
      `${PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX}${payload}`,
    ),
  ).toEqual({ kind: "invalid-contextual" });
});
