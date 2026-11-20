import { describe, expect, it } from "vitest";

import {
  formatRunTime,
  getNextRuns,
  getTimeZoneLabel,
  getZonedDate,
} from "./schedule-times";

const isoRuns = (runs: Date[] | null) =>
  runs?.map((run) => run.toISOString()) ?? null;

describe("getNextRuns", () => {
  it("lists the next runs of a cron expression at its time in its time zone", () => {
    /* A Friday morning. London is on GMT in November. */
    expect(
      isoRuns(
        getNextRuns(
          {
            type: "cron",
            cronExpression: "0 9 * * 1-5",
            timezone: "Europe/London",
          },
          new Date("2026-11-20T10:00:00Z"),
          3,
        ),
      ),
    ).toEqual([
      "2026-11-23T09:00:00.000Z",
      "2026-11-24T09:00:00.000Z",
      "2026-11-25T09:00:00.000Z",
    ]);
  });

  it("reads the time zone's offset on each day, across a change of the clocks", () => {
    /* Berlin goes from UTC+1 to UTC+2 on 29 March 2026. */
    expect(
      isoRuns(
        getNextRuns(
          {
            type: "cron",
            cronExpression: "30 8 * * *",
            timezone: "Europe/Berlin",
          },
          new Date("2026-03-28T06:00:00Z"),
          3,
        ),
      ),
    ).toEqual([
      "2026-03-28T07:30:00.000Z",
      "2026-03-29T06:30:00.000Z",
      "2026-03-30T06:30:00.000Z",
    ]);
  });

  it("starts from the day it already is in a time zone ahead of UTC", () => {
    /* 08:00 on 21 November in Auckland, which is UTC+13 then. */
    expect(
      isoRuns(
        getNextRuns(
          {
            type: "cron",
            cronExpression: "0 9 * * *",
            timezone: "Pacific/Auckland",
          },
          new Date("2026-11-20T19:00:00Z"),
          1,
        ),
      ),
    ).toEqual(["2026-11-20T20:00:00.000Z"]);
  });

  it("is in UTC when the expression has no time zone, and only after the instant given", () => {
    expect(
      isoRuns(
        getNextRuns(
          { type: "cron", cronExpression: "0 9 * * *" },
          new Date("2026-11-20T09:00:00Z"),
          1,
        ),
      ),
    ).toEqual(["2026-11-21T09:00:00.000Z"]);
  });

  it("runs only on days that match both the day of month and the day of week, as Temporal does", () => {
    /* The 2nd Tuesday of each month, rather than days 8–14 and every Tuesday. */
    expect(
      isoRuns(
        getNextRuns(
          { type: "cron", cronExpression: "0 9 8-14 * 2" },
          new Date("2026-11-01T00:00:00Z"),
          3,
        ),
      ),
    ).toEqual([
      "2026-11-10T09:00:00.000Z",
      "2026-12-08T09:00:00.000Z",
      "2027-01-12T09:00:00.000Z",
    ]);
  });

  it("reads a sixth field as the year, so a run once happens once", () => {
    const once = {
      type: "cron",
      cronExpression: "0 9 10 11 * 2026",
    } as const;

    expect(
      isoRuns(getNextRuns(once, new Date("2026-11-01T00:00:00Z"), 3)),
    ).toEqual(["2026-11-10T09:00:00.000Z"]);
    expect(
      isoRuns(getNextRuns(once, new Date("2026-11-11T00:00:00Z"), 3)),
    ).toEqual([]);
  });

  it("reads a seventh field first as the second, and steps and names as Temporal does", () => {
    expect(
      isoRuns(
        getNextRuns(
          { type: "cron", cronExpression: "30 0/20 9 * * MON *" },
          new Date("2026-11-20T00:00:00Z"),
          4,
        ),
      ),
    ).toEqual([
      "2026-11-23T09:00:30.000Z",
      "2026-11-23T09:20:30.000Z",
      "2026-11-23T09:40:30.000Z",
      "2026-11-30T09:00:30.000Z",
    ]);
  });

  it("runs an interval at every multiple of it since the epoch", () => {
    expect(
      isoRuns(
        getNextRuns(
          { type: "interval", intervalMs: 10 * 60 * 1000 },
          new Date("2026-11-20T10:03:00Z"),
          2,
        ),
      ),
    ).toEqual(["2026-11-20T10:10:00.000Z", "2026-11-20T10:20:00.000Z"]);
  });

  it("gives none for an expression it can't read", () => {
    expect(
      getNextRuns(
        { type: "cron", cronExpression: "@daily" },
        new Date("2026-11-20T00:00:00Z"),
        3,
      ),
    ).toBeNull();
    expect(
      getNextRuns(
        { type: "cron", cronExpression: "0 25 * * *" },
        new Date("2026-11-20T00:00:00Z"),
        3,
      ),
    ).toBeNull();
  });
});

describe("getZonedDate", () => {
  it("is the day it is in the time zone", () => {
    expect(
      getZonedDate(new Date("2026-11-20T23:30:00Z"), "Europe/Berlin"),
    ).toEqual({ year: 2026, month: 11, day: 21 });
  });
});

describe("formatRunTime", () => {
  it("shows a run in the schedule's time zone", () => {
    expect(
      formatRunTime(new Date("2026-11-23T09:00:00Z"), "America/New_York"),
    ).toBe("Mon 23 Nov, 04:00");
  });
});

describe("getTimeZoneLabel", () => {
  it("names a time zone by its city and its offset then", () => {
    const november = new Date("2026-11-20T12:00:00Z");

    expect(getTimeZoneLabel("Europe/London", november)).toBe("London · GMT");
    expect(getTimeZoneLabel("America/New_York", november)).toBe(
      "New York · GMT-5",
    );
    expect(getTimeZoneLabel("UTC", november)).toBe("UTC");
  });
});
