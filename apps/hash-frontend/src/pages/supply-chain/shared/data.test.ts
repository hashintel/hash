import { beforeEach, describe, expect, it, vi } from "vitest";

import { AnalysisError } from "../../../shared/analysis-client";

const fetchSiteProductionTimelineMock = vi.hoisted(() => vi.fn());

vi.mock("./supply-chain-analysis-requests", () => ({
  fetchGraph: vi.fn(),
  fetchProductionSchedule: vi.fn(),
  fetchProducts: vi.fn(),
  fetchSiteProductionTimeline: fetchSiteProductionTimelineMock,
  fetchSiteSummary: vi.fn(),
  fetchSites: vi.fn(),
  fetchStepDetail: vi.fn(),
  fetchSupplierPerformance: vi.fn(),
}));

const {
  configureDataSource,
  fetchSiteProductionTimeline,
  SiteProductionTimelineUnavailableError,
} = await import("./data");

const timeline = (siteId: string) => ({
  schema_version: "1.3",
  artifact_type: "site_production_timeline",
  artifact_version: "1.2",
  site_id: siteId,
  plant: siteId.toUpperCase(),
  generated_at: "2026-06-17T00:00:00Z",
  date_bounds: { start: null, end: null },
  buildings: [],
  lines: [],
  resources: [],
  product_families: [],
  products: [],
  batches: [],
  consumption_edges: [],
  data_quality: {
    batch_count: 0,
    edge_count: 0,
    timing_kind_counts: {},
    line_confidence_counts: {},
    edge_confidence_counts: {},
    batches_with_allocation_overage: 0,
    batches_missing_family: 0,
    negative_waiting_intervals: 0,
    materials_with_multiple_lines: [],
    products_missing_family: [],
    unidentifiable_receipt_events: 0,
  },
  source: {
    production_windows: "test",
    receipt_events: "test",
    consumption_edges: "test",
    metadata: {},
    unidentifiable_receipt_events: 0,
  },
});

describe("site production timeline cache", () => {
  beforeEach(() => {
    fetchSiteProductionTimelineMock.mockReset();
    configureDataSource({ scope: "web-a" });
  });

  it("caches per web and site and clears on data-source changes", async () => {
    fetchSiteProductionTimelineMock.mockImplementation(
      (_webId: string, siteId: string) => Promise.resolve(timeline(siteId)),
    );

    const first = fetchSiteProductionTimeline("site-a");
    expect(fetchSiteProductionTimeline("site-a")).toBe(first);
    await first;
    await fetchSiteProductionTimeline("site-b");
    expect(fetchSiteProductionTimelineMock).toHaveBeenCalledTimes(2);

    configureDataSource({ scope: "web-b" });
    await fetchSiteProductionTimeline("site-a");
    expect(fetchSiteProductionTimelineMock).toHaveBeenCalledTimes(3);
  });

  it("evicts rejected promises so retry can succeed", async () => {
    fetchSiteProductionTimelineMock
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(timeline("site-a"));

    await expect(fetchSiteProductionTimeline("site-a")).rejects.toThrow(
      "temporary",
    );
    await expect(fetchSiteProductionTimeline("site-a")).resolves.toMatchObject({
      site_id: "site-a",
    });
    expect(fetchSiteProductionTimelineMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      "direct",
      new AnalysisError(
        "The optional timeline is not published",
        "OPTIONAL_ARTIFACT_UNAVAILABLE",
      ),
    ],
    [
      "wrapped",
      new Error("Request wrapper", {
        cause: new AnalysisError(
          "The optional timeline is not published",
          "OPTIONAL_ARTIFACT_UNAVAILABLE",
        ),
      }),
    ],
  ])(
    "types a %s optional-unavailable response as absent",
    async (_label, error) => {
      fetchSiteProductionTimelineMock.mockRejectedValueOnce(error);

      await expect(
        fetchSiteProductionTimeline("site-a"),
      ).rejects.toBeInstanceOf(SiteProductionTimelineUnavailableError);
    },
  );

  it.each([
    "Artifact timeline fetch failed with status 404",
    "Gateway not found",
  ])("keeps retryable failures distinct from absence: %s", async (message) => {
    fetchSiteProductionTimelineMock.mockRejectedValueOnce(new Error(message));
    const pending = fetchSiteProductionTimeline("site-a");

    await expect(pending).rejects.toThrow(message);
    await expect(pending).rejects.not.toBeInstanceOf(
      SiteProductionTimelineUnavailableError,
    );
  });
});
