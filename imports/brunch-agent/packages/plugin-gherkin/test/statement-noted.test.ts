import { describe, expect, test } from "bun:test";

import { createSweepExtractionResultSchema } from "@brunch/core";
import * as v from "valibot";

import { gherkin } from "../src/index.ts";

const quote = "Payment is authorized before fulfillment.";
const statementNoted = {
  evidence: [{ excerpt: quote }],
  epistemicStatus: "explicit" as const,
  confidence: "firm" as const,
  content: {
    value: {
      type: "statement-noted" as const,
      interior: { verbatim: quote },
    },
  },
};

describe("the Gherkin verbatim-grade proposal floor", () => {
  test("declares exactly one statement proposal and compiles it into sweep extraction", () => {
    expect(gherkin.proposalCatalog.map((proposal) => proposal.name)).toEqual(["statement-noted"]);
    expect(
      v.parse(createSweepExtractionResultSchema(gherkin), {
        proposals: [statementNoted],
      }),
    ).toEqual({ proposals: [statementNoted] });
  });

  test("refuses silent hardening and structure above the verbatim grade", () => {
    const schema = createSweepExtractionResultSchema(gherkin);
    expect(() =>
      v.parse(schema, {
        proposals: [
          {
            ...statementNoted,
            content: {
              value: {
                type: "statement-noted",
                interior: { verbatim: "authorization precedes fulfillment" },
              },
            },
          },
        ],
      }),
    ).toThrow(/verbatim/i);
    expect(() =>
      v.parse(schema, {
        proposals: [
          {
            ...statementNoted,
            content: {
              value: {
                type: "statement-noted",
                interior: { verbatim: quote, parsed: { operator: "before" } },
              },
            },
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      v.parse(schema, {
        proposals: [
          {
            ...statementNoted,
            evidence: [
              {
                excerpt: quote,
                pointer: { sessionId: "invented", entryStart: 1, entryEnd: 1 },
              },
            ],
          },
        ],
      }),
    ).toThrow();
  });
});
