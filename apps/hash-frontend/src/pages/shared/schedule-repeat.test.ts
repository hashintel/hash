import { describe, expect, it } from "vitest";

import {
  describeRepeatRule,
  getRepeatPresets,
  parseCronExpression,
  toCronExpression,
} from "./schedule-repeat";
import { formatScheduleSpec } from "./use-flow-schedules";

import type { RepeatRule } from "./schedule-repeat";

const nineAm = { hour: 9, minute: 0 };

describe("getRepeatPresets", () => {
  it("follows the date: once on it, every day, weekday and its weekday, monthly on its weekday and its day, and yearly", () => {
    /* A Tuesday, and the second one of its month. */
    const presets = getRepeatPresets({ year: 2026, month: 11, day: 10 });

    expect(
      presets.map((rule) => [
        describeRepeatRule(rule),
        toCronExpression(rule, nineAm),
      ]),
    ).toEqual([
      ["Once on 10 Nov 2026", "0 9 10 11 * 2026"],
      ["Every day", "0 9 * * *"],
      ["Every weekday", "0 9 * * 1-5"],
      ["Every Tuesday", "0 9 * * 2"],
      /* Temporal needs both the day of month and the day of week to match, so this is the Tuesday among days 8–14. */
      ["2nd Tuesday of every month", "0 9 8-14 * 2"],
      ["10th of every month", "0 9 10 * *"],
      ["Every year on 10 Nov", "0 9 10 11 *"],
    ]);
  });

  it("counts the weekday of the month in sevens from the 1st, up to the 28th", () => {
    const monthlyWeekday = (day: number) =>
      getRepeatPresets({ year: 2026, month: 11, day }).find(
        (rule) => rule.kind === "monthlyWeekday",
      );

    /* 7 Nov 2026 is a Saturday, the first; the 8th a Sunday, the second; the 28th a Saturday, the fourth. */
    expect(monthlyWeekday(7)).toEqual({
      kind: "monthlyWeekday",
      nth: 1,
      weekday: 6,
    });
    expect(monthlyWeekday(8)).toEqual({
      kind: "monthlyWeekday",
      nth: 2,
      weekday: 0,
    });
    expect(toCronExpression(monthlyWeekday(28)!, nineAm)).toBe("0 9 22-28 * 6");
    /* A fifth Sunday isn't in every month, so the 29th has no such preset. */
    expect(monthlyWeekday(29)).toBeUndefined();
  });
});

describe("describeRepeatRule", () => {
  it("names chosen weekdays from Monday, with Sunday last", () => {
    expect(describeRepeatRule({ kind: "weekly", weekdays: [5, 0, 1, 3] })).toBe(
      "Every Monday, Wednesday, Friday and Sunday",
    );
    expect(describeRepeatRule({ kind: "weekly", weekdays: [6, 0] })).toBe(
      "Every Saturday and Sunday",
    );
  });

  it("writes days of the month as ordinals", () => {
    expect(
      [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(
        (day) => describeRepeatRule({ kind: "monthlyDay", day }).split(" ")[0],
      ),
    ).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "31st",
    ]);
  });
});

describe("toCronExpression", () => {
  it("puts the minute before the hour, and lists chosen weekdays in cron's order, Sunday as 0", () => {
    expect(
      toCronExpression(
        { kind: "weekly", weekdays: [5, 0, 1] },
        { hour: 7, minute: 45 },
      ),
    ).toBe("45 7 * * 0,1,5");
  });
});

describe("parseCronExpression", () => {
  it("reads back every rule the form makes, with its time", () => {
    const time = { hour: 17, minute: 5 };
    const rules: RepeatRule[] = [
      ...getRepeatPresets({ year: 2027, month: 2, day: 23 }),
      { kind: "weekly", weekdays: [0, 3, 6] },
      { kind: "weekly", weekdays: [0, 6] },
    ];

    for (const rule of rules) {
      expect(parseCronExpression(toCronExpression(rule, time))).toEqual({
        rule,
        time,
      });
    }
  });

  it("reads weekday ranges and 7 as Sunday, as Temporal does", () => {
    expect(parseCronExpression("30 6 * * 5-7")).toEqual({
      rule: { kind: "weekly", weekdays: [0, 5, 6] },
      time: { hour: 6, minute: 30 },
    });
  });

  it("reads other spellings of what the form makes", () => {
    const time = { hour: 9, minute: 0 };

    expect(parseCronExpression("0 9 * * MON")).toEqual({
      rule: { kind: "weekly", weekdays: [1] },
      time,
    });
    expect(parseCronExpression("0 0 9 * * 1")).toBeNull();
    expect(parseCronExpression("0 0 9 * * 1 *")).toEqual({
      rule: { kind: "weekly", weekdays: [1] },
      time,
    });
    expect(parseCronExpression("0 9 15,8-14 * 2")).toBeNull();
    expect(parseCronExpression("0 9 8,9,10,11,12,13,14 * TUE")).toEqual({
      rule: { kind: "monthlyWeekday", nth: 2, weekday: 2 },
      time,
    });
  });

  it("leaves out what the form doesn't make", () => {
    for (const cronExpression of [
      /* Every hour, or every 15 minutes. */
      "0 * * * *",
      "*/15 9 * * *",
      /* The 10th, if it's a Tuesday. */
      "0 9 10 * 2",
      /* A week of days that isn't one of the month's sevens. */
      "0 9 2-8 * 1",
      /* A year without a date. */
      "0 9 * * * 2026",
      /* A run at a second past the minute. */
      "30 0 9 * * * *",
      "@daily",
      "60 9 * * *",
      /* Numbers that aren't plain digits. */
      "0 1e1 * * *",
      "0x1 9 * * *",
    ]) {
      expect(parseCronExpression(cronExpression)).toBeNull();
    }
  });
});

describe("formatScheduleSpec", () => {
  it("describes a cron expression the form makes, and shows any other as it is", () => {
    expect(
      formatScheduleSpec({ type: "cron", cronExpression: "0 8 * * 1" }, "UTC"),
    ).toBe("Every Monday at 08:00");
    expect(
      formatScheduleSpec(
        { type: "cron", cronExpression: "0 */2 * * *" },
        "UTC",
      ),
    ).toBe("Cron: 0 */2 * * *");
  });

  it("names a cron's time zone, UTC unless it has one, when it isn't the viewer's", () => {
    const monday = { type: "cron", cronExpression: "0 8 * * 1" } as const;
    const newYork = { ...monday, timezone: "America/New_York" };

    expect(formatScheduleSpec(newYork, "America/New_York")).toBe(
      "Every Monday at 08:00",
    );
    expect(formatScheduleSpec(newYork, "Europe/London")).toBe(
      "Every Monday at 08:00 (New York)",
    );
    expect(formatScheduleSpec(monday, "Europe/London")).toBe(
      "Every Monday at 08:00 (UTC)",
    );
    expect(formatScheduleSpec(newYork, null)).toBe("Every Monday at 08:00");
    expect(
      formatScheduleSpec({ type: "interval", intervalMs: 3_600_000 }, "UTC"),
    ).toBe("Every 1 hour");
  });
});
