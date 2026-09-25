import { createHash } from "node:crypto";

import { describe, expect, test, vi } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent/constants";

import {
  draftPetrinautExperimentInputSchema,
  draftPetrinautExperimentOutputSchema,
} from "../src/draft-experiment";
import { createDraftExperimentTool } from "../src/tools/draft-experiment";

import type { BrowserToolExecutor } from "../src/tools/petrinaut-construction";

const currentRevision = {
  revisionId: "revision-1",
  ordinal: 1,
  markdown: "Queue work.",
  sha256: createHash("sha256").update("Queue work.").digest("hex"),
  evidence: [],
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
    expect(brunchTools.draftPetrinautExperiment).toBe(
      "draft_petrinaut_experiment",
    );
  });

  test("accepts an integer range and a disclosed restriction without protocol identity", () => {
    const parsed = draftPetrinautExperimentInputSchema.parse(input);
    expect(parsed.experiment.execution.mode).toBe("optimize");
    expect(parsed.unsupported[0]?.reportedByMetricId).toBe("metric-late");
    expect(parsed.unsupported[0]?.blocksRun).toBe(true);
    expect(
      draftPetrinautExperimentInputSchema.parse({
        ...input,
        unsupported: [{ ...input.unsupported[0], blocksRun: false }],
      }).unsupported[0]?.blocksRun,
    ).toBe(false);
  });

  test("rejects claiming that an unselected metric will be reported", () => {
    const result = draftPetrinautExperimentInputSchema.safeParse({
      ...input,
      unsupported: [
        { ...input.unsupported[0], reportedByMetricId: "metric-not-selected" },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual([
      "unsupported",
      0,
      "reportedByMetricId",
    ]);
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

  test("serialises to JSON Schema without dropping the request fields", () => {
    const jsonSchema = draftPetrinautExperimentInputSchema[
      "~standard"
    ].jsonSchema.input({ target: "draft-2020-12" }) as
      | { properties?: Record<string, unknown> }
      | undefined;
    expect(jsonSchema?.properties).toBeDefined();
    expect(Object.keys(jsonSchema?.properties ?? {}).sort()).toEqual([
      "declarations",
      "experiment",
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
  test("authorizes against a prior read and settled Ledger, then awaits the browser preparation in band", async () => {
    const authorizeDraft = vi.fn<() => Promise<{ revisionId: string }>>(
      async () => ({
        revisionId: currentRevision.revisionId,
      }),
    );
    const prepared = {
      status: "drafted" as const,
      summary: "Drafted.",
      diagnostics: [],
    };
    const executeBrowserTool = vi.fn<BrowserToolExecutor>(async () => ({
      output: prepared,
    }));
    const tool = createDraftExperimentTool({
      currentRevision,
      retainedRevisionFor: async () => undefined,
      authorizeDraft,
      executeBrowserTool,
    });
    await expect(
      tool.run({ data: input, toolCallId: "draft-1" } as never),
    ).resolves.toEqual({
      output: { brunchBrowserResult: true, output: prepared },
      terminate: false,
    });
    expect(authorizeDraft).toHaveBeenCalledWith("draft-1");
    expect(executeBrowserTool).toHaveBeenCalledWith({
      toolName: brunchTools.draftPetrinautExperiment,
      input,
      toolCallId: "draft-1",
      signal: undefined,
    });
  });

  test("fails closed for an absent read or unsettled basis", async () => {
    const executeBrowserTool = vi.fn<BrowserToolExecutor>(async () => ({
      output: null,
    }));
    const options = {
      currentRevision,
      retainedRevisionFor: async () => undefined,
      executeBrowserTool,
    };
    await expect(
      createDraftExperimentTool({
        ...options,
        authorizeDraft: async () => {
          throw new Error("Absent canonical read");
        },
      }).run({ toolCallId: "draft-1", data: input } as never),
    ).rejects.toThrow(/Absent canonical read/u);
    await expect(
      createDraftExperimentTool({
        ...options,
        authorizeDraft: async () => ({ revisionId: "other" }),
      }).run({ toolCallId: "draft-1", data: input } as never),
    ).rejects.toThrow(/stale or unsettled/u);
    await expect(
      createDraftExperimentTool({
        ...options,
        currentRevision: null,
        authorizeDraft: async () => ({
          revisionId: currentRevision.revisionId,
        }),
      }).run({ toolCallId: "draft-1", data: input } as never),
    ).rejects.toThrow(/Settle a Ledger/u);
    expect(executeBrowserTool).not.toHaveBeenCalled();
  });
});
