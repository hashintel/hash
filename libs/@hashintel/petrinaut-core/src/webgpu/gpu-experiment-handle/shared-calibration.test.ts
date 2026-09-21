import { describe, expect, it } from "vitest";

import { shareCalibration } from "./shared-calibration";

describe("shareCalibration", () => {
  it("lets a later batch wait for the batch that claimed the key", async () => {
    const calibrating = new Map<string, Promise<void>>();
    const first = shareCalibration(calibrating, "marking");
    expect(first.inFlight).toBeUndefined();
    const settle = first.claim();

    const second = shareCalibration(calibrating, "marking");
    expect(second.inFlight).toBeDefined();
    let woke = false;
    void second.inFlight!.then(() => {
      woke = true;
    });
    await Promise.resolve();
    expect(woke).toBe(false);

    settle();
    await Promise.resolve();
    expect(woke).toBe(true);
    expect(calibrating.has("marking")).toBe(false);
  });

  it("settles idempotently and never drops a newer claim", () => {
    const calibrating = new Map<string, Promise<void>>();
    const stale = shareCalibration(calibrating, "marking").claim();
    stale();
    const fresh = shareCalibration(calibrating, "marking");
    expect(fresh.inFlight).toBeUndefined();
    const settleFresh = fresh.claim();

    stale();
    expect(calibrating.has("marking")).toBe(true);

    settleFresh();
    expect(calibrating.has("marking")).toBe(false);
    expect(shareCalibration(calibrating, "other").inFlight).toBeUndefined();
  });
});
