export const ingestFixtures = [
  { id: "uk-practice-direction-51zh", label: "UK Practice Direction" },
  { id: "gao-25-107546", label: "GAO Report" },
] as const;

export type IngestResultsSource =
  | { kind: "fixture"; fixtureId: string }
  | { kind: "run"; runId: string };

export const getIngestPath = (runId?: string): string =>
  runId ? `/ingest?${new URLSearchParams({ runId }).toString()}` : "/ingest";

export const getIngestRunApiPath = (runId: string): string =>
  `/api/ingest/${encodeURIComponent(runId)}`;

/**
 * Derive the results source from Next.js query params.
 */
export const getIngestResultsSource = (query: {
  runId?: string;
  fixture?: string;
}): IngestResultsSource => {
  if (query.runId) {
    return { kind: "run", runId: query.runId };
  }

  return {
    kind: "fixture",
    fixtureId: query.fixture ?? ingestFixtures[0].id,
  };
};

export const getIngestResultsPath = (source: IngestResultsSource): string => {
  const params = new URLSearchParams();

  if (source.kind === "fixture") {
    params.set("fixture", source.fixtureId);
  } else {
    params.set("runId", source.runId);
  }

  return `/ingest/results?${params.toString()}`;
};
