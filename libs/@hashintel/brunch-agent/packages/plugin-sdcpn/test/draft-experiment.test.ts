import { describe, expect, test, vi } from "vitest";

import {
  draftPetrinautExperimentInputSchema,
  draftPetrinautExperimentOutputSchema,
  draftPetrinautExperimentToolName,
  isDraftPetrinautExperimentToolName,
} from "../src/draft-experiment";
import { createDraftExperimentTool } from "../src/tools/draft-experiment";

import type { DefinitionObservation } from "../src/mutation-record";
import type { SDCPN } from "@hashintel/petrinaut-core";

const hash = "a".repeat(64);
const currentRevision = {
  revisionId: "revision-1",
  ordinal: 1,
  markdown: "Queue work.",
  sha256: "b".repeat(64),
  evidence: [],
};
const emptyDefinition: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const declaredBasis = {
  kind: "declared" as const,
  revisionId: currentRevision.revisionId,
  sha256: currentRevision.sha256,
  locators: [{ start: 0, end: 5 }],
  rationale: "The workpiece states the decision, measure and range.",
  scope: "operation" as const,
};

const experiment = {
  name: "Vans on the parcel route",
  scenarioId: "scenario-peak",
  scenarioParameterValues: {
    vans: { mode: "range" as const, min: 2, max: 8 },
  },
  runCount: 40,
  seed: 7,
  dt: 0.5,
  maxTime: 120,
  metricIds: ["metric-wait", "metric-late"],
  execution: {
    mode: "optimize" as const,
    objectiveMetricId: "metric-wait",
    direction: "minimize" as const,
    steps: 10,
    runsPerStep: 4,
  },
};

const input = {
  observation: { toolCallId: "read-1", baseHash: hash },
  experiment,
  declarations: [
    {
      subject: "maxTime",
      statement: "120 model minutes: the two-hour peak window.",
    },
    {
      subject: "metric-late",
      statement: "Late parcels are reported, not enforced.",
    },
  ],
  basis: declaredBasis,
  unsupported: [
    {
      condition: "No parcel may wait more than 30 minutes.",
      reason:
        "The request carries no constraints, so the threshold is not enforced.",
      reportedByMetricId: "metric-late",
    },
  ],
};

const withExperiment = (
  patch: Partial<
    Omit<typeof experiment, "scenarioParameterValues"> & {
      scenarioParameterValues: Record<string, unknown>;
    }
  >,
) => ({
  ...input,
  experiment: { ...experiment, ...patch },
});

describe("draft_petrinaut_experiment input schema", () => {
  test("names the tool", () => {
    expect(draftPetrinautExperimentToolName).toBe("draft_petrinaut_experiment");
    expect(
      isDraftPetrinautExperimentToolName("draft_petrinaut_experiment"),
    ).toBe(true);
    expect(isDraftPetrinautExperimentToolName("mutate_petrinaut_net")).toBe(
      false,
    );
  });

  test("accepts an integer range, a declared basis and a disclosed restriction", () => {
    const parsed = draftPetrinautExperimentInputSchema.parse(input);
    expect(parsed.experiment.execution.mode).toBe("optimize");
    expect(parsed.unsupported[0]?.reportedByMetricId).toBe("metric-late");
  });

  test("accepts an absent basis when its reason is stated", () => {
    expect(
      draftPetrinautExperimentInputSchema.safeParse({
        ...input,
        basis: {
          kind: "absent",
          reason: "The range was stated in conversation and not yet settled.",
        },
      }).success,
    ).toBe(true);
  });

  test("rejects an objective that is not among the saved metrics", () => {
    const result = draftPetrinautExperimentInputSchema.safeParse(
      withExperiment({
        execution: { ...experiment.execution, objectiveMetricId: "metric-x" },
      }),
    );
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toMatch(
      /objective must be included in metricIds/u,
    );
  });

  test("rejects a time step longer than the horizon", () => {
    expect(
      draftPetrinautExperimentInputSchema.safeParse(
        withExperiment({ dt: 200, maxTime: 120 }),
      ).success,
    ).toBe(false);
  });

  test("rejects a search budget above the host's bound", () => {
    const tooMany = draftPetrinautExperimentInputSchema.safeParse(
      withExperiment({
        runCount: 1000,
        execution: { ...experiment.execution, steps: 100, runsPerStep: 200 },
      }),
    );
    expect(tooMany.success).toBe(false);
    const overRunCount = draftPetrinautExperimentInputSchema.safeParse(
      withExperiment({
        runCount: 3,
        execution: { ...experiment.execution, runsPerStep: 4 },
      }),
    );
    expect(overRunCount.success).toBe(false);
  });

  test("rejects an optimization with no varied parameter", () => {
    expect(
      draftPetrinautExperimentInputSchema.safeParse(
        withExperiment({
          scenarioParameterValues: { vans: { mode: "fixed", value: 4 } },
        }),
      ).success,
    ).toBe(false);
  });

  test("rejects an inverted range", () => {
    expect(
      draftPetrinautExperimentInputSchema.safeParse(
        withExperiment({
          scenarioParameterValues: { vans: { mode: "range", min: 8, max: 2 } },
        }),
      ).success,
    ).toBe(false);
  });

  test("rejects duplicate metric IDs", () => {
    expect(
      draftPetrinautExperimentInputSchema.safeParse(
        withExperiment({ metricIds: ["metric-wait", "metric-wait"] }),
      ).success,
    ).toBe(false);
  });

  test("has no constraint carriage: a constraints field is rejected", () => {
    const result = draftPetrinautExperimentInputSchema.safeParse({
      ...input,
      experiment: {
        ...experiment,
        constraints: [{ metricId: "metric-late", max: 0 }],
      },
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toMatch(/constraints/u);
  });

  test("requires at least one declaration", () => {
    expect(
      draftPetrinautExperimentInputSchema.safeParse({
        ...input,
        declarations: [],
      }).success,
    ).toBe(false);
  });

  test("requires the observation the identifiers were copied from", () => {
    const { observation: _observation, ...withoutObservation } = input;
    expect(
      draftPetrinautExperimentInputSchema.safeParse(withoutObservation).success,
    ).toBe(false);
    expect(
      draftPetrinautExperimentInputSchema.safeParse({
        ...input,
        observation: { toolCallId: "read-1", baseHash: "not-a-hash" },
      }).success,
    ).toBe(false);
  });

  test("serialises to JSON Schema without dropping the request fields", () => {
    const jsonSchema = draftPetrinautExperimentInputSchema[
      "~standard"
    ].jsonSchema.input({ target: "draft-2020-12" }) as
      | { properties?: Record<string, unknown> }
      | undefined;
    expect(jsonSchema?.properties).toBeDefined();
    expect(Object.keys(jsonSchema?.properties ?? {}).sort()).toEqual([
      "basis",
      "declarations",
      "experiment",
      "observation",
      "unsupported",
    ]);
    const experimentSchema = jsonSchema?.properties?.experiment as {
      properties?: Record<string, unknown>;
    };
    expect(Object.keys(experimentSchema.properties ?? {}).sort()).toEqual([
      "dt",
      "execution",
      "maxTime",
      "metricIds",
      "name",
      "runCount",
      "scenarioId",
      "scenarioParameterValues",
      "seed",
    ]);
  });
});

describe("draft_petrinaut_experiment output schema", () => {
  test("carries the browser's preparation status and diagnostics", () => {
    expect(
      draftPetrinautExperimentOutputSchema.safeParse({
        status: "drafted",
        summary: "Vary vans 2–8; minimize metric-wait.",
        diagnostics: [],
      }).success,
    ).toBe(true);
    expect(
      draftPetrinautExperimentOutputSchema.safeParse({
        status: "running",
        summary: "",
        diagnostics: [],
      }).success,
    ).toBe(false);
  });
});

describe("createDraftExperimentTool", () => {
  test("validates the workpiece and exact prior observation before deferring", async () => {
    const observationFor = vi.fn<
      (id: string) => Promise<DefinitionObservation>
    >(async () => ({ definition: emptyDefinition, sha256: hash }));
    const tool = createDraftExperimentTool({
      currentRevision,
      retainedRevisionFor: async () => undefined,
      observationFor,
    });

    await expect(tool.run({ data: input } as never)).resolves.toMatchObject({
      output: { awaiting: "client" },
      terminate: true,
    });
    expect(observationFor).toHaveBeenCalledWith("read-1");
  });

  test("rejects a draft whose identifiers came from a stale observation", async () => {
    const stale = createDraftExperimentTool({
      currentRevision,
      retainedRevisionFor: async () => undefined,
      observationFor: async () => ({
        definition: emptyDefinition,
        sha256: "c".repeat(64),
      }),
    });
    await expect(stale.run({ data: input } as never)).rejects.toThrow(
      /differs from the verified browser observation/u,
    );
  });

  test("rejects a draft before the workpiece is settled", async () => {
    const unsettled = createDraftExperimentTool({
      currentRevision: null,
      retainedRevisionFor: async () => undefined,
      observationFor: async () => ({
        definition: emptyDefinition,
        sha256: hash,
      }),
    });
    await expect(unsettled.run({ data: input } as never)).rejects.toThrow(
      /Settle the workpiece/u,
    );
  });

  test("rejects a basis citing a different workpiece revision", async () => {
    const tool = createDraftExperimentTool({
      currentRevision,
      retainedRevisionFor: async () => undefined,
      observationFor: async () => ({
        definition: emptyDefinition,
        sha256: hash,
      }),
    });
    await expect(
      tool.run({
        data: { ...input, basis: { ...declaredBasis, sha256: "d".repeat(64) } },
      } as never),
    ).rejects.toThrow(/citation hash mismatch/u);
  });
});
