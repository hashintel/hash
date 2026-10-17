import { expect, test } from "vitest";

import {
  PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX,
  PETRINAUT_CONTEXTUAL_USER_TEXT_MAX_LENGTH,
  parsePetrinautUserMessageBody,
  petrinautContextualUserMessageBody,
} from "./contextual-user-message";

import type { SubmissionContext } from "./contextual-user-message";

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

const submissionContextPrefix = "petrinaut-contextual-user-message:v2\n";

test("round trips opaque host context without interpreting its keys", () => {
  const submissionContext = {
    anyHostKey: { nested: [1, "two", true, null] },
    another: "value",
  };
  const body = petrinautContextualUserMessageBody({
    userText: "Four agents",
    diagnosticsContext: "",
    submissionContext,
  });
  expect(body.startsWith(submissionContextPrefix)).toBe(true);
  expect(parsePetrinautUserMessageBody(body)).toEqual({
    kind: "contextual",
    userText: "Four agents",
    diagnosticsContext: "",
    submissionContext,
  });
  expect(
    parsePetrinautUserMessageBody(
      petrinautContextualUserMessageBody({
        userText: "Four agents",
        diagnosticsContext: "diagnostic",
        submissionContext,
      }),
    ),
  ).toMatchObject({ diagnosticsContext: "diagnostic", submissionContext });
});

test("keeps diagnostics-only bodies byte-identical to version one", () => {
  expect(
    petrinautContextualUserMessageBody({
      userText: "Four agents",
      diagnosticsContext: "diagnostic",
    }),
  ).toBe(
    `${PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX}{"userText":"Four agents","diagnosticsContext":"diagnostic"}`,
  );
  expect(parsePetrinautUserMessageBody("Four agents")).toEqual({
    kind: "ordinary",
    userText: "Four agents",
  });
});

test.each([
  ["an empty object", {}],
  ["an array", ["value"]],
  ["a non-finite number", { key: Number.NaN }],
  ["an undefined value", { key: undefined }],
  ["a class instance", { key: new Date(0) }],
  ["an oversized value", { key: "x".repeat(16_001) }],
  [
    "excessive nesting",
    {
      key: Array.from({ length: 20 }).reduce<unknown>(
        (inner) => ({ inner }),
        null,
      ),
    },
  ],
])("refuses %s as submission context", (_label, submissionContext) => {
  expect(() =>
    petrinautContextualUserMessageBody({
      userText: "Four agents",
      diagnosticsContext: "",
      submissionContext: submissionContext as SubmissionContext,
    }),
  ).toThrow("The contextual user message payload is invalid or too long.");
});

test.each([
  [
    "a missing context",
    JSON.stringify({ userText: "Four agents", diagnosticsContext: "" }),
  ],
  [
    "an empty context",
    JSON.stringify({
      userText: "Four agents",
      diagnosticsContext: "",
      submissionContext: {},
    }),
  ],
  [
    "an extra field",
    JSON.stringify({
      userText: "Four agents",
      diagnosticsContext: "",
      submissionContext: { key: 1 },
      assertedBy: "user",
    }),
  ],
])("refuses %s in version two framing", (_label, payload) => {
  expect(
    parsePetrinautUserMessageBody(`${submissionContextPrefix}${payload}`),
  ).toEqual({ kind: "invalid-contextual" });
});
