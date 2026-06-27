import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendTelemetryMock } = vi.hoisted(() => ({
  sendTelemetryMock: vi.fn(),
}));

vi.mock("../../../shared/telemetry-client", () => ({
  sendTelemetry: sendTelemetryMock,
}));

const {
  trackSupplyChainError,
  trackSupplyChainInteraction,
  trackSupplyChainStatusReportCreated,
  trackSupplyChainViewed,
} = await import("./telemetry");

beforeEach(() => {
  sendTelemetryMock.mockClear();
});

describe("supply-chain telemetry", () => {
  it("wraps a single track event with the mapped name and properties", () => {
    trackSupplyChainViewed({ route: "/supply-chain", source: "nav" });

    expect(sendTelemetryMock).toHaveBeenCalledTimes(1);
    expect(sendTelemetryMock).toHaveBeenCalledWith({
      events: [
        {
          type: "track",
          name: "supply_chain_viewed",
          properties: { route: "/supply-chain", source: "nav" },
        },
      ],
    });
  });

  it("maps each helper to its allowlisted event name", () => {
    trackSupplyChainInteraction({ interaction: "tab_changed" });
    trackSupplyChainError({ interaction: "load_failed" });

    expect(sendTelemetryMock.mock.calls[0]?.[0].events[0].name).toBe(
      "supply_chain_interaction",
    );
    expect(sendTelemetryMock.mock.calls[1]?.[0].events[0].name).toBe(
      "supply_chain_error",
    );
  });

  it("never sends status free-text or comments", () => {
    // The payload the hook constructs for a saved status report.
    trackSupplyChainStatusReportCreated({
      opportunityType: "dwell",
      productId: "p1",
      siteId: "site-a",
      source: "status_dialog",
      stepId: "step-1",
    });

    const [payload] = sendTelemetryMock.mock.calls[0] ?? [];
    const properties = payload?.events[0]?.properties ?? {};

    expect(Object.keys(properties)).toEqual(
      expect.arrayContaining(["opportunityType", "productId", "siteId"]),
    );
    for (const forbidden of ["text", "comment", "statusText", "category"]) {
      expect(properties).not.toHaveProperty(forbidden);
    }
    // Defensive: no value carries the comment body either.
    expect(JSON.stringify(properties)).not.toContain("comment");
  });
});
