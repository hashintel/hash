import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WebId } from "@blockprotocol/type-system";

const {
  fetchAnalysisArtifactMock,
  fetchAnalysisArtifactsMock,
  fetchArtifactJsonMock,
  runAnalysesMock,
} = vi.hoisted(() => ({
  fetchAnalysisArtifactMock: vi.fn(),
  fetchAnalysisArtifactsMock: vi.fn(),
  fetchArtifactJsonMock: vi.fn(),
  runAnalysesMock: vi.fn(),
}));

vi.mock("../../../shared/analysis-client", () => ({
  fetchAnalysisArtifact: fetchAnalysisArtifactMock,
  fetchAnalysisArtifacts: fetchAnalysisArtifactsMock,
  fetchArtifactJson: fetchArtifactJsonMock,
  runAnalyses: runAnalysesMock,
}));

const {
  fetchProductionSchedule,
  fetchSites,
  fetchSupplierPerformance,
  resolveSupplyChainDataWebId,
} = await import("./supply-chain-analysis-requests");

const webId = (value: string) => value as WebId;

beforeEach(() => {
  fetchAnalysisArtifactMock.mockReset();
  fetchAnalysisArtifactsMock.mockReset();
  fetchArtifactJsonMock.mockReset();
  runAnalysesMock.mockReset();
});

describe("fetchSites", () => {
  it("returns the listed sites on success", async () => {
    const sites = [{ slug: "a", name: "A" }];
    fetchAnalysisArtifactMock.mockResolvedValue(sites);
    await expect(fetchSites(webId("w"))).resolves.toEqual(sites);
  });

  it("falls back to an empty list when the artifact is missing", async () => {
    fetchAnalysisArtifactMock.mockRejectedValue(new Error("404"));
    await expect(fetchSites(webId("w"))).resolves.toEqual([]);
  });
});

describe("fetchProductionSchedule", () => {
  it("requests the product-scoped schedule analysis", async () => {
    const schedule = { artifact_type: "production_schedule" };
    fetchAnalysisArtifactMock.mockResolvedValue(schedule);

    await expect(
      fetchProductionSchedule(webId("w"), "product-a"),
    ).resolves.toBe(schedule);
    expect(fetchAnalysisArtifactMock).toHaveBeenCalledWith({
      analysis: "productionSchedule",
      args: { productId: "product-a" },
      webId: "w",
    });
  });
});

describe("fetchSupplierPerformance", () => {
  it("returns null when there is no performance artifact", async () => {
    fetchAnalysisArtifactsMock.mockResolvedValue({});
    await expect(fetchSupplierPerformance(webId("w"))).resolves.toBeNull();
  });

  it("re-attaches companion lines when the performance payload omits them", async () => {
    fetchAnalysisArtifactsMock.mockResolvedValue({
      performance: { ref: "perf" },
      lines: { ref: "lines" },
    });
    fetchArtifactJsonMock
      .mockResolvedValueOnce({ totals: 1 })
      .mockResolvedValueOnce({ lines: [{ id: "l1" }] });

    await expect(fetchSupplierPerformance(webId("w"))).resolves.toEqual({
      totals: 1,
      lines: [{ id: "l1" }],
    });
  });

  it("re-attaches companion lines when the performance payload has an empty lines array", async () => {
    fetchAnalysisArtifactsMock.mockResolvedValue({
      performance: { ref: "perf" },
      lines: { ref: "lines" },
    });
    fetchArtifactJsonMock
      .mockResolvedValueOnce({ totals: 1, lines: [] })
      .mockResolvedValueOnce({ lines: [{ id: "l1" }] });

    await expect(fetchSupplierPerformance(webId("w"))).resolves.toEqual({
      totals: 1,
      lines: [{ id: "l1" }],
    });
  });

  it("tolerates a missing companion lines file", async () => {
    fetchAnalysisArtifactsMock.mockResolvedValue({
      performance: { ref: "perf" },
      lines: { ref: "lines" },
    });
    fetchArtifactJsonMock
      .mockResolvedValueOnce({ totals: 1 })
      .mockRejectedValueOnce(new Error("no lines"));

    await expect(fetchSupplierPerformance(webId("w"))).resolves.toEqual({
      totals: 1,
    });
  });

  it("returns null when the request throws", async () => {
    fetchAnalysisArtifactsMock.mockRejectedValue(new Error("boom"));
    await expect(fetchSupplierPerformance(webId("w"))).resolves.toBeNull();
  });
});

describe("resolveSupplyChainDataWebId", () => {
  it("returns null when there are no candidates", async () => {
    await expect(
      resolveSupplyChainDataWebId({ candidateWebIds: [] }),
    ).resolves.toBeNull();
    expect(runAnalysesMock).not.toHaveBeenCalled();
  });

  it("deduplicates candidate webIds before running analyses", async () => {
    runAnalysesMock.mockResolvedValue([{ status: "ready", artifacts: ["a0"] }]);
    fetchArtifactJsonMock.mockResolvedValue([{ id: "p1" }]);

    await resolveSupplyChainDataWebId({
      candidateWebIds: [webId("w1"), webId("w1")],
    });

    expect(runAnalysesMock).toHaveBeenCalledTimes(1);
    expect(runAnalysesMock.mock.calls[0]?.[0]).toHaveLength(1);
  });

  it("returns the first candidate (by order) that has products", async () => {
    runAnalysesMock.mockResolvedValue([
      { status: "ready", artifacts: ["a0"] },
      { status: "ready", artifacts: ["a1"] },
    ]);
    fetchArtifactJsonMock
      .mockResolvedValueOnce([]) // w1: empty
      .mockResolvedValueOnce([{ id: "p1" }]); // w2: has products

    await expect(
      resolveSupplyChainDataWebId({
        candidateWebIds: [webId("w1"), webId("w2")],
      }),
    ).resolves.toBe(webId("w2"));
  });

  it("returns null when no candidate has products", async () => {
    runAnalysesMock.mockResolvedValue([{ status: "ready", artifacts: ["a0"] }]);
    fetchArtifactJsonMock.mockResolvedValue([]);

    await expect(
      resolveSupplyChainDataWebId({ candidateWebIds: [webId("w1")] }),
    ).resolves.toBeNull();
  });

  it("tolerates non-ready analysis results", async () => {
    runAnalysesMock.mockResolvedValue([{ status: "error" }]);

    await expect(
      resolveSupplyChainDataWebId({ candidateWebIds: [webId("w1")] }),
    ).resolves.toBeNull();
    expect(fetchArtifactJsonMock).not.toHaveBeenCalled();
  });
});
