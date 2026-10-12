import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  isAtlasSpeculationPaused,
  noteAtlasRateLimited,
  resetAtlasBackpressure,
} from "./atlas-backpressure";

describe("atlas backpressure", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    resetAtlasBackpressure();
  });

  it("is not paused until a rate limit is noted", () => {
    expect(isAtlasSpeculationPaused()).toBe(false);
  });

  it("pauses for the floor when the refusal names no wait", () => {
    noteAtlasRateLimited();
    expect(isAtlasSpeculationPaused()).toBe(true);

    vi.setSystemTime(1_999);
    expect(isAtlasSpeculationPaused()).toBe(true);
    vi.setSystemTime(2_000);
    expect(isAtlasSpeculationPaused()).toBe(false);
  });

  it("honours a stated wait beyond the floor", () => {
    noteAtlasRateLimited(30_000);

    vi.setSystemTime(29_999);
    expect(isAtlasSpeculationPaused()).toBe(true);
    vi.setSystemTime(30_000);
    expect(isAtlasSpeculationPaused()).toBe(false);
  });

  it("caps a stated wait at five minutes", () => {
    noteAtlasRateLimited(60 * 60_000);

    vi.setSystemTime(5 * 60_000 - 1);
    expect(isAtlasSpeculationPaused()).toBe(true);
    vi.setSystemTime(5 * 60_000);
    expect(isAtlasSpeculationPaused()).toBe(false);
  });

  it("never shortens a pause already standing", () => {
    noteAtlasRateLimited(30_000);
    noteAtlasRateLimited(1_000);

    vi.setSystemTime(10_000);
    expect(isAtlasSpeculationPaused()).toBe(true);
  });

  it("resets for tests", () => {
    noteAtlasRateLimited(30_000);
    resetAtlasBackpressure();
    expect(isAtlasSpeculationPaused()).toBe(false);
  });
});
