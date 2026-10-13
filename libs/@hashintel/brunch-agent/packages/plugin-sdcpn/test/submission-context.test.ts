import { expect, test } from "vitest";

import {
  PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX,
  parsePetrinautUserMessageBody,
  petrinautContextualUserMessageBody,
} from "../src/contextual-user-message";

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
      submissionContext: submissionContext as Record<string, unknown>,
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
