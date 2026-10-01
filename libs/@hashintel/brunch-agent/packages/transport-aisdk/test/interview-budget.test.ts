import { expect, it } from "vitest";

import {
  parsePetrinautUserMessageBody,
  petrinautContextualUserMessageBody,
} from "../src/contextual-user-message";

it("keeps budget context separate from human evidence across submissions", () => {
  for (const remaining of [3, 1, 0]) {
    const interviewBudget = {
      level: "quick",
      questionCap: 3,
      asked: 3 - remaining,
      remaining,
    };
    const body = petrinautContextualUserMessageBody({
      userText: "Four agents",
      diagnosticsContext: "",
      interviewBudget,
    });
    expect(parsePetrinautUserMessageBody(body)).toEqual({
      kind: "contextual",
      userText: "Four agents",
      diagnosticsContext: "",
      interviewBudget,
    });
  }
});

it("does not change ordinary or diagnostic-only Off bodies", () => {
  expect(parsePetrinautUserMessageBody("Four agents")).toEqual({
    kind: "ordinary",
    userText: "Four agents",
  });
  expect(
    petrinautContextualUserMessageBody({
      userText: "Four agents",
      diagnosticsContext: "diagnostic",
    }),
  ).toBe(
    'petrinaut-contextual-user-message:v1\n{"userText":"Four agents","diagnosticsContext":"diagnostic"}',
  );
});
