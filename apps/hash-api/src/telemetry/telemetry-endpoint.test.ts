import { describe, expect, it } from "vitest";

import { parseTelemetryEvent } from "./telemetry-endpoint";

describe("parseTelemetryEvent", () => {
  it("accepts a page event with a name", () => {
    expect(parseTelemetryEvent({ type: "page", name: "/foo" })).toEqual({
      type: "page",
      name: "/foo",
      properties: undefined,
    });
  });

  it("accepts an allowlisted track event", () => {
    expect(
      parseTelemetryEvent({
        type: "track",
        name: "supply_chain_product_viewed",
        properties: { productId: "abc" },
      }),
    ).toEqual({
      type: "track",
      name: "supply_chain_product_viewed",
      properties: { productId: "abc" },
    });
  });

  it("rejects a non-allowlisted track event name", () => {
    expect(
      parseTelemetryEvent({ type: "track", name: "analysis_run" }),
    ).toBeNull();
    expect(
      parseTelemetryEvent({ type: "track", name: "arbitrary_event" }),
    ).toBeNull();
  });

  it("rejects unknown event types", () => {
    expect(parseTelemetryEvent({ type: "identify", name: "x" })).toBeNull();
  });

  it("rejects a page event without a name", () => {
    expect(parseTelemetryEvent({ type: "page" })).toBeNull();
    expect(parseTelemetryEvent({ type: "page", name: "" })).toBeNull();
  });

  it("rejects non-objects", () => {
    expect(parseTelemetryEvent(null)).toBeNull();
    expect(parseTelemetryEvent("page")).toBeNull();
    expect(parseTelemetryEvent(42)).toBeNull();
  });

  it("drops non-object properties rather than forwarding them", () => {
    expect(
      parseTelemetryEvent({
        type: "page",
        name: "/foo",
        properties: ["not", "an", "object"],
      }),
    ).toEqual({ type: "page", name: "/foo", properties: undefined });
  });
});
