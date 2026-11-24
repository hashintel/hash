import { describe, expect, it } from "vitest";

import {
  getNewTriggerBlocker,
  getScheduleBlocker,
  toScheduleFormValues,
  toScheduleSpec,
} from "./trigger-form-values";

import type { NewTriggerFormValues } from "./trigger-form-values";
import type { EntityId } from "@blockprotocol/type-system";
import type { FlowInputDefinition } from "@local/hash-isomorphic-utils/flows/types";

const flowEntityId =
  "0b5a5c4c-6d4d-4cd8-9d5e-2f2b0f7a6a11~aaaaaaaa-1111-4111-8111-111111111111" as EntityId;

const aRun = [new Date("2026-11-23T09:00:00Z")];

const input = (
  fields: Partial<FlowInputDefinition> & Pick<FlowInputDefinition, "name">,
): FlowInputDefinition => ({
  payloadKind: "Text",
  array: false,
  required: true,
  ...fields,
});

const newTrigger = (
  fields: Partial<NewTriggerFormValues> = {},
): NewTriggerFormValues => ({
  flowEntityId,
  webId: null,
  name: "Weekly supplier check",
  repeat: { kind: "rule", rule: { kind: "weekly", weekdays: [1] } },
  time: { hour: 8, minute: 30 },
  timeZone: "Europe/London",
  runNow: false,
  inputValues: {},
  ...fields,
});

describe("toScheduleFormValues", () => {
  it("reads a cron expression the form makes as its rule and time, in UTC if it has no time zone", () => {
    expect(
      toScheduleFormValues(
        { type: "cron", cronExpression: "15 7 * * 1-5" },
        "Europe/Berlin",
      ),
    ).toEqual({
      repeat: {
        kind: "rule",
        rule: { kind: "weekly", weekdays: [1, 2, 3, 4, 5] },
      },
      time: { hour: 7, minute: 15 },
      timeZone: "UTC",
    });
  });

  it("keeps a spec the form can't make, with the time zone a rule chosen for it would start in", () => {
    const interval = { type: "interval", intervalMs: 600_000 } as const;
    const hourly = {
      type: "cron",
      cronExpression: "0 * * * *",
      timezone: "Asia/Tokyo",
    } as const;

    expect(toScheduleFormValues(interval, "Europe/Berlin")).toMatchObject({
      repeat: { kind: "kept", scheduleSpec: interval },
      timeZone: "Europe/Berlin",
    });
    expect(toScheduleFormValues(hourly, "Europe/Berlin")).toMatchObject({
      repeat: { kind: "kept", scheduleSpec: hourly },
      timeZone: "Asia/Tokyo",
    });
  });
});

describe("toScheduleSpec", () => {
  it("compiles a rule at its time in the time zone", () => {
    expect(
      toScheduleSpec({
        repeat: {
          kind: "rule",
          rule: { kind: "monthlyWeekday", nth: 2, weekday: 2 },
        },
        time: { hour: 9, minute: 0 },
        timeZone: "Europe/London",
      }),
    ).toEqual({
      type: "cron",
      cronExpression: "0 9 8-14 * 2",
      timezone: "Europe/London",
    });
  });

  it("keeps a kept cron expression as it is in the time zone chosen, and an interval as it is", () => {
    expect(
      toScheduleSpec({
        repeat: {
          kind: "kept",
          scheduleSpec: { type: "cron", cronExpression: "0 * * * *" },
        },
        time: { hour: 9, minute: 0 },
        timeZone: "Asia/Tokyo",
      }),
    ).toEqual({
      type: "cron",
      cronExpression: "0 * * * *",
      timezone: "Asia/Tokyo",
    });
    expect(
      toScheduleSpec({
        repeat: {
          kind: "kept",
          scheduleSpec: { type: "interval", intervalMs: 600_000 },
        },
        time: { hour: 9, minute: 0 },
        timeZone: "Asia/Tokyo",
      }),
    ).toEqual({ type: "interval", intervalMs: 600_000 });
  });
});

describe("getScheduleBlocker", () => {
  it("stops a schedule with no days, or with no runs to come, but not one whose runs aren't known", () => {
    const schedule = newTrigger();

    expect(
      getScheduleBlocker(
        {
          ...schedule,
          repeat: { kind: "rule", rule: { kind: "weekly", weekdays: [] } },
        },
        aRun,
      ),
    ).toBe("Choose the days it repeats on");
    expect(getScheduleBlocker(schedule, [])).toBe(
      "It wouldn't run again: choose a later time",
    );
    expect(getScheduleBlocker(schedule, null)).toBeNull();
    expect(getScheduleBlocker(schedule, aRun)).toBeNull();
  });
});

describe("getNewTriggerBlocker", () => {
  it("asks for a flow, then a name that isn't blank", () => {
    expect(
      getNewTriggerBlocker(
        newTrigger({ flowEntityId: null, name: "" }),
        null,
        aRun,
      ),
    ).toBe("Choose a flow");
    expect(getNewTriggerBlocker(newTrigger({ name: "   " }), [], aRun)).toBe(
      "Name the trigger",
    );
  });

  it("asks for the required inputs left blank, by their labels, but not the optional ones", () => {
    const inputs = [
      input({
        name: "reviewMonth",
        label: "Review month",
        payloadKind: "Date",
      }),
      input({ name: "note", required: false }),
      input({ name: "threshold", label: "Threshold", payloadKind: "Number" }),
    ];

    expect(
      getNewTriggerBlocker(
        newTrigger({
          inputValues: {
            reviewMonth: { kind: "Date", value: "" },
            note: { kind: "Text", value: "" },
            threshold: { kind: "Number", value: null },
          },
        }),
        inputs,
        aRun,
      ),
    ).toBe("Fill in Review month, Threshold");
    expect(
      getNewTriggerBlocker(
        newTrigger({
          inputValues: {
            reviewMonth: { kind: "Date", value: "2026-11-01" },
            note: { kind: "Text", value: "" },
            threshold: { kind: "Number", value: 0 },
          },
        }),
        inputs,
        aRun,
      ),
    ).toBeNull();
  });

  it("says when the flow needs an input the form can't take", () => {
    expect(
      getNewTriggerBlocker(
        newTrigger(),
        [input({ name: "sheet", label: "Sheet", payloadKind: "GoogleSheet" })],
        aRun,
      ),
    ).toBe("“Sheet” takes a Google Sheet, which can't be given here yet");
  });
});
