import { describe, expect, it } from "vitest";

import {
  OPTIMIZATION_STATUS_DISPLAY,
  optimizationDisplayStatus,
  WIDEST_OPTIMIZATION_STATUS,
} from "./optimization-status";

describe("optimizationDisplayStatus", () => {
  it("reads Stopped for a cancelled connected study and Cancelled for a remote one", () => {
    const stopped = optimizationDisplayStatus({
      status: "cancelled",
      connected: {} as never,
      connectionState: null,
    });
    const cancelled = optimizationDisplayStatus({
      status: "cancelled",
      connected: null,
      connectionState: null,
    });
    expect(OPTIMIZATION_STATUS_DISPLAY[stopped]).toEqual({
      label: "Stopped",
      tone: "neutral",
    });
    expect(OPTIMIZATION_STATUS_DISPLAY[cancelled]).toEqual({
      label: "Cancelled",
      tone: "neutral",
    });
  });

  it("reads Reconnecting while the stream re-establishes, whatever the status", () => {
    expect(
      optimizationDisplayStatus({
        status: "running",
        connected: null,
        connectionState: "reconnecting",
      }),
    ).toBe("reconnecting");
    expect(OPTIMIZATION_STATUS_DISPLAY.reconnecting).toEqual({
      label: "Reconnecting",
      tone: "active",
    });
  });

  it("passes the record's own status through otherwise", () => {
    expect(
      optimizationDisplayStatus({
        status: "paused",
        connected: {} as never,
        connectionState: "streaming",
      }),
    ).toBe("paused");
  });

  it("sizes the pill for the widest label in the table", () => {
    expect(WIDEST_OPTIMIZATION_STATUS).toBe("Reconnecting");
    const longest = Object.values(OPTIMIZATION_STATUS_DISPLAY)
      .map((entry) => entry.label.length)
      .reduce((max, length) => Math.max(max, length), 0);
    expect(WIDEST_OPTIMIZATION_STATUS).toHaveLength(longest);
  });
});
