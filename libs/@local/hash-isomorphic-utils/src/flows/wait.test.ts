import { describe, expect, it } from "vitest";

import { flowDefinitionSchema } from "./flow-definition-schema.js";
import {
  checkWaitInputs,
  durationToMs,
  parseDateTime,
  resolveResumeAt,
} from "./wait.js";

import type {
  ActionStepDefinition,
  Duration,
  StepInputSource,
} from "./types.js";

const startedAt = new Date("2026-10-13T12:00:00.000Z");

const resumeAfter = (duration: Duration) =>
  resolveResumeAt({ duration }, startedAt);

const resumeUntil = (until: string) => resolveResumeAt({ until }, startedAt);

const anError = { status: "error", message: expect.any(String) };

describe("durationToMs", () => {
  it.each([
    [{ amount: 45, unit: "seconds" }, 45_000],
    [{ amount: 90, unit: "minutes" }, 5_400_000],
    [{ amount: 5, unit: "hours" }, 18_000_000],
    [{ amount: 2, unit: "days" }, 172_800_000],
    [{ amount: 3, unit: "weeks" }, 1_814_400_000],
  ] as const)("converts %o to %d ms", (duration, ms) => {
    expect(durationToMs(duration)).toBe(ms);
  });
});

describe("parseDateTime", () => {
  it("reads an offset as the UTC instant it names", () => {
    expect(parseDateTime("2026-10-16T16:00:00+02:00")).toBe(
      Date.UTC(2026, 9, 16, 14),
    );
    expect(parseDateTime("2026-10-16T08:30:00-05:30")).toBe(
      Date.UTC(2026, 9, 16, 14),
    );
  });

  it("reads fractional seconds and values without seconds", () => {
    expect(parseDateTime("2026-10-16T14:00:00.25Z")).toBe(
      Date.UTC(2026, 9, 16, 14, 0, 0, 250),
    );
    expect(parseDateTime("2026-10-16T14:00Z")).toBe(Date.UTC(2026, 9, 16, 14));
  });

  it.each([
    "",
    "next tuesday",
    "2026-10-16",
    "2026-10-16T14:00:00",
    "2026-10-16 14:00:00Z",
    "2026-02-30T14:00:00Z",
    "2026-13-01T14:00:00Z",
    "2026-10-16T24:00:00Z",
    "2026-10-16T14:00:00+24:00",
    "Fri, 16 Oct 2026 14:00:00 GMT",
  ])("rejects %j", (value) => {
    expect(parseDateTime(value)).toEqual(anError);
  });
});

describe("resolveResumeAt", () => {
  describe("with a duration", () => {
    it.each([
      [{ amount: 45, unit: "seconds" }, "2026-10-13T12:00:45.000Z"],
      [{ amount: 90, unit: "minutes" }, "2026-10-13T13:30:00.000Z"],
      [{ amount: 5, unit: "hours" }, "2026-10-13T17:00:00.000Z"],
      [{ amount: 2, unit: "days" }, "2026-10-15T12:00:00.000Z"],
      [{ amount: 3, unit: "weeks" }, "2026-11-03T12:00:00.000Z"],
      [{ amount: 30, unit: "days" }, "2026-11-12T12:00:00.000Z"],
    ] as const)("resumes %o after it starts at %s", (duration, resumeAt) => {
      expect(resumeAfter(duration)).toBe(resumeAt);
    });

    it.each([
      { amount: 0, unit: "hours" },
      { amount: -1, unit: "hours" },
      { amount: Number.NaN, unit: "hours" },
      { amount: Number.POSITIVE_INFINITY, unit: "hours" },
      { amount: 31, unit: "days" },
      { amount: 5, unit: "weeks" },
      { amount: 30 * 24 * 60 * 60 + 1, unit: "seconds" },
    ] as const)("rejects %o", (duration) => {
      expect(resumeAfter(duration)).toEqual(anError);
    });
  });

  describe("with an until time", () => {
    it("resumes at a future time", () => {
      expect(resumeUntil("2026-10-16T14:00:00Z")).toBe(
        "2026-10-16T14:00:00.000Z",
      );
    });

    it("resumes at the UTC instant an offset names", () => {
      expect(resumeUntil("2026-10-16T16:00:00+02:00")).toBe(
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

    it.each([
      "",
      "tomorrow",
      "2026-10-16T14:00:00",
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

describe("checkWaitInputs", () => {
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

  it.each(["", "2026-10-16T14:00:00", "tomorrow", 1_792_159_200_000])(
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
});
