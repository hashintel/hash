import { describe, expect, it } from "vitest";

import { flowDefinitionSchema } from "./flow-definition-schema.js";
import { checkWaitInputs, resolveResumeAt } from "./wait.js";

import type { ActionStepDefinition, StepInputSource } from "./types.js";

const startedAt = new Date("2026-10-13T12:00:00.000Z");

const resumeAfter = (duration: unknown) =>
  resolveResumeAt({ duration }, startedAt);

const resumeUntil = (until: unknown) => resolveResumeAt({ until }, startedAt);

const anError = { status: "error", message: expect.any(String) };

describe("resolveResumeAt", () => {
  describe("with a duration", () => {
    it.each([
      [{ amount: 45, unit: "seconds" }, "2026-10-13T12:00:45.000Z"],
      [{ amount: 90, unit: "minutes" }, "2026-10-13T13:30:00.000Z"],
      [{ amount: 5, unit: "hours" }, "2026-10-13T17:00:00.000Z"],
      [{ amount: 2, unit: "days" }, "2026-10-15T12:00:00.000Z"],
      [{ amount: 3, unit: "weeks" }, "2026-11-03T12:00:00.000Z"],
      [{ amount: 30, unit: "days" }, "2026-11-12T12:00:00.000Z"],
      [{ amount: 1.5, unit: "hours" }, "2026-10-13T13:30:00.000Z"],
      [{ amount: 0.5, unit: "days" }, "2026-10-14T00:00:00.000Z"],
    ] as const)("resumes %o after it starts at %s", (duration, resumeAt) => {
      expect(resumeAfter(duration)).toBe(resumeAt);
    });

    it.each<unknown>([
      { amount: 0, unit: "hours" },
      { amount: -1, unit: "hours" },
      { amount: Number.NaN, unit: "hours" },
      { amount: Number.POSITIVE_INFINITY, unit: "hours" },
      { amount: 31, unit: "days" },
      { amount: 5, unit: "weeks" },
      { amount: 30 * 24 * 60 * 60 + 1, unit: "seconds" },
      { amount: 2, unit: "months" },
      { amount: "2", unit: "days" },
      {},
      null,
    ])("rejects %o", (duration) => {
      expect(resumeAfter(duration)).toEqual(anError);
    });
  });

  describe("with an until time", () => {
    it("resumes at a future time", () => {
      expect(resumeUntil("2026-10-16T14:00:00Z")).toBe(
        "2026-10-16T14:00:00.000Z",
      );
    });

    it("continues straight away when the time has passed", () => {
      expect(resumeUntil("2026-10-01T00:00:00Z")).toBe(startedAt.toISOString());
    });

    it("continues straight away when the time is when it starts", () => {
      expect(resumeUntil("2026-10-13T12:00:00Z")).toBe(startedAt.toISOString());
    });

    it("resumes exactly 30 days after it starts", () => {
      expect(resumeUntil("2026-11-12T12:00:00Z")).toBe(
        "2026-11-12T12:00:00.000Z",
      );
    });

    it.each<unknown>([
      "tomorrow",
      12_345,
      /* `it.each` spreads an array row into arguments, so this passes an array of one string. */
      [["2026-10-16T14:00:00Z"]],
      "2026-11-12T12:00:01Z",
      "2026-11-12T14:00:01+02:00",
    ])("rejects %j", (until) => {
      expect(resumeUntil(until)).toEqual(anError);
    });
  });

  it("rejects neither a duration nor an until time", () => {
    expect(resolveResumeAt({}, startedAt)).toEqual({
      status: "error",
      message: "A Wait step needs either a duration or an until time.",
    });
  });

  it("rejects both a duration and an until time", () => {
    expect(
      resolveResumeAt(
        {
          duration: { amount: 1, unit: "hours" },
          until: "2026-10-16T14:00:00Z",
        },
        startedAt,
      ),
    ).toEqual({
      status: "error",
      message:
        "A Wait step needs either a duration or an until time, not both.",
    });
  });
});

const duration = (value: unknown): StepInputSource => ({
  kind: "constant",
  payload: { kind: "Duration", value },
});

const until = (value: unknown): StepInputSource => ({
  kind: "constant",
  payload: { kind: "DateTime", value },
});

const reportsFor = (inputs: Record<string, StepInputSource>) => {
  const step: ActionStepDefinition<string> = {
    kind: "action",
    stepId: "wait",
    actionDefinitionId: "wait",
    description: "",
    inputs,
  };
  const reported: string[] = [];

  checkWaitInputs({
    step,
    getInputKind: () => null,
    report: (inputName) => reported.push(inputName),
  });

  return reported;
};

describe("checkWaitInputs", () => {
  it("reports neither a duration nor an until time", () => {
    expect(reportsFor({})).toEqual(["duration"]);
  });

  it("reports both a duration and an until time", () => {
    expect(
      reportsFor({
        duration: { kind: "flow-input", inputName: "duration" },
        until: { kind: "flow-input", inputName: "until" },
      }),
    ).toEqual(["until"]);
  });

  it.each([
    { amount: 2, unit: "days" },
    { amount: 30, unit: "days" },
    { amount: 1.5, unit: "hours" },
  ])("accepts the constant duration %o", (value) => {
    expect(reportsFor({ duration: duration(value) })).toEqual([]);
  });

  it.each([
    { amount: 0, unit: "days" },
    { amount: -2, unit: "days" },
    { amount: 31, unit: "days" },
    { amount: 2, unit: "months" },
    { amount: "2", unit: "days" },
    {},
    null,
  ])("reports the constant duration %o", (value) => {
    expect(reportsFor({ duration: duration(value) })).toEqual(["duration"]);
  });

  it.each(["2026-10-16T14:00:00Z", "2026-10-16T16:00:00+02:00"])(
    "accepts the constant until time %j",
    (value) => {
      expect(reportsFor({ until: until(value) })).toEqual([]);
    },
  );

  it("leaves the 30-day limit on a constant until time to when the step starts", () => {
    expect(reportsFor({ until: until("2030-01-01T00:00:00Z") })).toEqual([]);
  });

  it.each(["tomorrow", 1_792_159_200_000])(
    "reports the constant until time %j",
    (value) => {
      expect(reportsFor({ until: until(value) })).toEqual(["until"]);
    },
  );

  it("leaves inputs from a flow input or an earlier step to when the step starts", () => {
    expect(
      reportsFor({ duration: { kind: "flow-input", inputName: "duration" } }),
    ).toEqual([]);
    expect(
      reportsFor({
        until: { kind: "step-output", stepId: "first", outputName: "at" },
      }),
    ).toEqual([]);
  });
});

describe("Duration and DateTime constants", () => {
  it("pass the flow definition schema", () => {
    const result = flowDefinitionSchema.safeParse({
      name: "Wait",
      description: "",
      inputs: [],
      steps: [
        {
          kind: "action",
          stepId: "waitFor",
          actionDefinitionId: "wait",
          description: "",
          inputs: {
            duration: duration({ amount: 2, unit: "days" }),
          },
        },
        {
          kind: "action",
          stepId: "waitUntil",
          actionDefinitionId: "wait",
          description: "",
          inputs: { until: until("2026-10-16T14:00:00Z") },
        },
      ],
      outputs: [],
    });

    expect(result.success).toBe(true);
  });

  it("pass the flow definition schema when malformed, so checkWaitInputs checks their shape", () => {
    const malformedDuration = duration({ amount: -1, unit: "months" });
    const malformedUntil = until("next tuesday");

    const result = flowDefinitionSchema.safeParse({
      name: "Wait",
      description: "",
      inputs: [],
      steps: [
        {
          kind: "action",
          stepId: "waitFor",
          actionDefinitionId: "wait",
          description: "",
          inputs: { duration: malformedDuration },
        },
        {
          kind: "action",
          stepId: "waitUntil",
          actionDefinitionId: "wait",
          description: "",
          inputs: { until: malformedUntil },
        },
      ],
      outputs: [],
    });

    expect(result.success).toBe(true);
    expect(reportsFor({ duration: malformedDuration })).toEqual(["duration"]);
    expect(reportsFor({ until: malformedUntil })).toEqual(["until"]);
  });
});
