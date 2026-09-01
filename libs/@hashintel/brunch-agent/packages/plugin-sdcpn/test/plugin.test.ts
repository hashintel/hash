import * as v from "valibot";
import { describe, expect, test } from "vitest";

import {
  captureDedupKey,
  completionDemands,
  createSweepExtractionResultSchema,
  evaluateCompletion,
  foldElicitedModel,
  type CaptureEnvelope,
  type JsonValue,
  type SlotAssertion,
} from "@hashintel/brunch-agent";

import { sdcpn, sdcpnDefinition } from "../src/index";

const proposalOf = (assertion: SlotAssertion) => ({
  evidence: [{ excerpt: "quote" }],
  epistemicStatus: "explicit" as const,
  confidence: "firm" as const,
  content: { value: assertion },
});

const asserted = (
  kind: string,
  node: string,
  slot: string,
  precision: SlotAssertion["precision"],
  value: JsonValue,
): SlotAssertion => ({
  type: "slot-asserted",
  kind,
  node,
  slot,
  precision,
  assertion: { value },
});

const notApplicable = (
  kind: string,
  node: string,
  slot: string,
): SlotAssertion => ({
  type: "slot-asserted",
  kind,
  node,
  slot,
  assertion: { absence: "not-applicable" },
});

let entry = 0;
const capture = (assertion: SlotAssertion): CaptureEnvelope => {
  entry += 1;
  const fields = {
    confidence: "firm" as const,
    content: { value: assertion as unknown as JsonValue },
    evidence: [
      {
        excerpt: `quote ${entry}`,
        pointer: { sessionId: "s", entryStart: entry, entryEnd: entry },
        source: "user" as const,
      },
    ],
    epistemicStatus: "explicit" as const,
  };
  return { ...fields, id: `c-${entry}`, dedupKey: captureDedupKey(fields) };
};

describe("the SDCPN plugin", () => {
  test("is the parsed file plus one slot-assertion proposal type", () => {
    expect(sdcpn.domainTypology).toBe("operational processes");
    expect(sdcpn.targetFormalism).toBe("sdcpn");
    expect(sdcpn.definition).toBe(sdcpnDefinition);
    expect(sdcpnDefinition.version).toBe("sdcpn/2026-09-01.1");
    expect(sdcpn.proposalCatalog.map((proposal) => proposal.name)).toEqual([
      "slot-asserted",
    ]);
  });

  test("keeps motif variants specific without repeating generic quantile teaching", () => {
    const motifs = new Map(
      sdcpnDefinition.guidance.motifs.map((motif) => [motif.name, motif.text]),
    );
    expect(motifs.get("shared resource")).toMatch(/indivisible.*splittable/iu);
    expect(motifs.get("batch, lot, load")).toMatch(/count.*clock/iu);
    expect(motifs.get("threshold on a continuous quantity")).toMatch(
      /weakest|combine/iu,
    );
    expect(
      sdcpnDefinition.guidance.techniques.map((technique) => technique.name),
    ).not.toContain("quantiles, never triangles");
    expect(
      sdcpnDefinition.guidance.failure_modes.map(
        (failureMode) => failureMode.name,
      ),
    ).not.toContain("overconfident triangle");
    expect(
      sdcpnDefinition.mustKnow.find(
        (row) =>
          row.kind === "dynamics" &&
          row.slot === "how it varies around that change",
      )?.precision,
    ).toEqual({ kind: "word", word: "spread" });
  });

  test("does not collect unsupported rationale on every kind", () => {
    expect(
      sdcpnDefinition.ontology.attributes.map((attribute) => attribute.name),
    ).not.toContain("rationale");
  });

  test("accepts an assertion addressed to a kind and slot the file names", () => {
    const schema = createSweepExtractionResultSchema(sdcpn);
    const proposal = proposalOf(
      asserted("activity", "fill", "how long it takes", "spread", {
        typical: 4,
        worse1in10: 6,
        better1in10: 3,
        unit: "minutes",
      }),
    );
    expect(v.parse(schema, { proposals: [proposal] })).toEqual({
      proposals: [proposal],
    });
  });

  test("refuses kinds and slots the file does not name, and values without a precision", () => {
    const schema = createSweepExtractionResultSchema(sdcpn);
    const reject = (assertion: SlotAssertion, message: RegExp) =>
      expect(() =>
        v.parse(schema, { proposals: [proposalOf(assertion)] }),
      ).toThrow(message);
    reject(asserted("queue", "q", "how long it takes", "spread", 1), /kind/u);
    reject(asserted("activity", "fill", "its colour", "named", "x"), /slot/u);
    reject(
      {
        ...asserted("activity", "fill", "how long it takes", "spread", 1),
        precision: undefined,
      },
      /precision/u,
    );
  });

  test("folds and completes a minimal model under the file's own rows", () => {
    const captures = [
      capture(
        asserted(
          "objective",
          "cycle",
          "the question, in the expert's words",
          "spelled out",
          {
            question: "How many items finish per shift?",
          },
        ),
      ),
      capture(
        asserted("objective", "cycle", "the nodes it depends on", "named", [
          "entity-type:item",
          "entity-type:station",
          "activity:fill",
          "ordering/flow:main",
        ]),
      ),
      capture(
        notApplicable(
          "objective",
          "cycle",
          'what "better" means, and trade-off weights',
        ),
      ),
      capture(
        asserted(
          "entity-type",
          "item",
          "the distinctions the process treats apart",
          "spelled out",
          ["small", "large"],
        ),
      ),
      capture(
        notApplicable(
          "entity-type",
          "item",
          "state that rides along with each instance",
        ),
      ),
      capture(
        notApplicable(
          "entity-type",
          "item",
          "how many there are, or the population's shape",
        ),
      ),
      capture(
        asserted(
          "entity-type",
          "station",
          "the distinctions the process treats apart",
          "spelled out",
          ["one station type"],
        ),
      ),
      capture(
        notApplicable(
          "entity-type",
          "station",
          "state that rides along with each instance",
        ),
      ),
      capture(
        asserted(
          "entity-type",
          "station",
          "how many there are, or the population's shape",
          "range",
          {
            low: 2,
            high: 3,
          },
        ),
      ),
      capture(
        asserted(
          "activity",
          "fill",
          "what it needs before it can start",
          "spelled out",
          ["an item", "a free station"],
        ),
      ),
      capture(
        asserted(
          "activity",
          "fill",
          "what it produces or changes",
          "spelled out",
          ["a filled item"],
        ),
      ),
      capture(notApplicable("activity", "fill", "who or what performs it")),
      capture(
        asserted("activity", "fill", "how long it takes", "spread", {
          typical: 4,
          worse1in10: 6,
          better1in10: 3,
          unit: "minutes",
        }),
      ),
      capture(
        notApplicable(
          "activity",
          "fill",
          "how often it occurs, if it is an event rather than a step",
        ),
      ),
      capture(
        notApplicable(
          "activity",
          "fill",
          "what is lost when it changes the system's mode",
        ),
      ),
      capture(
        asserted(
          "activity",
          "fill",
          "whether its quantities vary by type",
          "named",
          "no",
        ),
      ),
      capture(
        asserted(
          "ordering/flow",
          "main",
          "the order things happen in",
          "spelled out",
          ["fill"],
        ),
      ),
      capture(
        notApplicable(
          "ordering/flow",
          "main",
          "how a branch or merge is decided",
        ),
      ),
    ];
    const model = foldElicitedModel(
      { captures, issues: [], events: [] },
      sdcpnDefinition,
    );
    expect(model.unmapped).toEqual([]);
    const report = evaluateCompletion(
      model,
      completionDemands(sdcpnDefinition),
    );
    expect(report.failures).toEqual([]);
    expect(report.complete).toBe(true);

    const withoutDuration = captures.filter((c) => c.id !== "c-13");
    const partial = evaluateCompletion(
      foldElicitedModel(
        { captures: withoutDuration, issues: [], events: [] },
        sdcpnDefinition,
      ),
      completionDemands(sdcpnDefinition),
    );
    expect(partial.complete).toBe(false);
    expect(
      partial.failures.map((f) => [f.diagnostic, f.nodeId, f.slot]),
    ).toEqual([["unaddressed", "activity:fill", "how long it takes"]]);
  });
});
