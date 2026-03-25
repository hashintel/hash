export const INGEST_FIXTURES = [
  { id: "uk-practice-direction-51zh", label: "UK Practice Direction" },
  { id: "gao-25-107546", label: "GAO Report" },
] as const;

export type IngestResultsSource =
  | { kind: "fixture"; fixtureId: string }
  | { kind: "run"; runId: string };

const DEFAULT_FIXTURE_ID = INGEST_FIXTURES[0].id;
const INGEST_FIXTURE_IDS = new Set<string>(
  INGEST_FIXTURES.map((fixture) => fixture.id),
);

/**
 * Derive the results source from Next.js query params.
 */
export function getIngestResultsSource(query: {
  runId?: string;
  fixture?: string;
}): IngestResultsSource {
  const runId = query.runId?.trim();
  if (runId) {
    return { kind: "run", runId };
  }

  const fixtureId = query.fixture?.trim();
  if (fixtureId && INGEST_FIXTURE_IDS.has(fixtureId)) {
    return { kind: "fixture", fixtureId };
  }

  return { kind: "fixture", fixtureId: DEFAULT_FIXTURE_ID };
}

export function getIngestResultsPath(source: IngestResultsSource): string {
  const params = new URLSearchParams();

  if (source.kind === "fixture") {
    params.set("fixture", source.fixtureId);
  } else {
    params.set("runId", source.runId);
  }

  return `/ingest/results?${params.toString()}`;
}
