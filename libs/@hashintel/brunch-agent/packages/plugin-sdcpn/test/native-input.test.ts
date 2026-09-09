import { describe, expect, test } from "vitest";
import { z } from "zod";

import { petrinautAiTools } from "@hashintel/petrinaut-core/ai";

import {
  joinedRootArcInputSchema,
  parseJoinedRootArcInput,
  observedArcInputSchema,
  parseObservedArcInput,
} from "../src/root-arc";
import {
  createJoinedRootArcTool,
  petrinautConstructionTools,
} from "../src/tools/petrinaut-construction";

const input = {
  transitionId: "transition",
  arcDirection: "input",
  placeId: "place",
  weight: 2,
  type: "standard",
  brunch: {
    basis: { kind: "absent", reason: "Synthetic native contract control." },
    requestedBaseHash: "a".repeat(64),
  },
};

describe("native canonical input ownership", () => {
  test.each(["addArc", "updateArcWeight"] as const)(
    "carries exact native %s inputs with a separately required earlier-read envelope",
    (name) => {
      const generated = observedArcInputSchema(name).toJSONSchema({
        io: "input",
      });
      const { brunch: _brunch, ...properties } = generated.properties ?? {};
      expect({
        ...generated,
        properties,
        required: generated.required?.filter((key) => key !== "brunch"),
      }).toEqual(
        petrinautAiTools[name].inputSchema.toJSONSchema({ io: "input" }),
      );
      const { type: _type, ...weightInput } = input;
      const raw = {
        ...(name === "addArc" ? input : weightInput),
        brunch: { ...input.brunch, observationToolCallId: "earlier-read" },
      };
      expect(parseObservedArcInput(name, raw)).toEqual(raw);
      expect(() =>
        parseObservedArcInput(name, { ...raw, brunch: input.brunch }),
      ).toThrow(z.ZodError);
      expect(() =>
        parseObservedArcInput(name, { ...raw, weight: true }),
      ).toThrow(z.ZodError);
    },
  );
  test("does not invent numeric-string normalization for canonical weight corrections", () => {
    const { type: _type, ...canonical } = input;
    expect(() =>
      parseObservedArcInput("updateArcWeight", {
        ...canonical,
        weight: "2",
        brunch: { ...input.brunch, observationToolCallId: "earlier" },
      }),
    ).toThrow(z.ZodError);
  });

  test("composes only Brunch's envelope and preserves the native root description", () => {
    const generated = z.toJSONSchema(joinedRootArcInputSchema, { io: "input" });
    const { brunch: _brunch, ...properties } = generated.properties ?? {};
    expect({
      ...generated,
      properties,
      required: generated.required?.filter((name) => name !== "brunch"),
    }).toEqual(
      z.toJSONSchema(petrinautAiTools.addArc.inputSchema, { io: "input" }),
    );
  });

  test("retains native runtime-only checks and refuses boolean weight without normalization loss", () => {
    for (const invalid of [
      { ...input, weight: true },
      { ...input, weight: 0 },
      { ...input, extra: true },
      { ...input, endpoint: { kind: "place", placeId: "other" } },
      { ...input, arcDirection: "output", type: "inhibitor" },
      { ...input, targetSubnetId: "subnet" },
      { ...input, placeId: undefined },
    ])
      expect(() => parseJoinedRootArcInput(invalid)).toThrow(z.ZodError);
    expect(parseJoinedRootArcInput(input)).toEqual(input);
  });

  test("explicitly normalizes numeric strings without widening the exported native contract", () => {
    const tool = createJoinedRootArcTool({
      currentRevision: null,
      retainedRevisionFor: async () => undefined,
      binding: {
        conversationId: "conversation",
        documentId: "document",
        incarnationId: "incarnation",
      },
      requestedBaseHash: input.brunch.requestedBaseHash,
    });
    expect(tool.input).toBe(joinedRootArcInputSchema);
    const raw = { ...input, weight: "2" };
    expect(tool.prepareArguments?.(raw)).toEqual(input);
    expect(raw.weight).toBe("2");
    expect(parseJoinedRootArcInput(raw)).toEqual(input);
    expect(joinedRootArcInputSchema.safeParse(raw).success).toBe(false);
  });

  test("uses the exact canonical addType schema, not a reconstructed carrier", () => {
    const tool = petrinautConstructionTools.find(
      (candidate) => candidate.name === "addType",
    );
    expect(tool?.input).toBe(petrinautAiTools.addType.inputSchema);
  });
});
