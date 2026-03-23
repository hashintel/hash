import { InfinityLightIcon } from "@hashintel/design-system";
import { Box, Container, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { NextPageWithLayout } from "../../shared/layout";
import { getLayoutWithSidebar } from "../../shared/layout";
import { Button } from "../../shared/ui/button";
import { WorkersHeader } from "../../shared/workers-header";
import type { Selection } from "../ingest.page/evidence-resolver";
import { resolveEvidence } from "../ingest.page/evidence-resolver";
import { PageViewer } from "../ingest.page/page-viewer";
import { ResultsPanel } from "../ingest.page/results-panel";
import {
  getIngestResultsPath,
  getIngestResultsSource,
  INGEST_FIXTURES,
} from "../ingest.page/routing";
import type { IngestRunView } from "../ingest.page/types";

const IngestResultsPage: NextPageWithLayout = () => {
  const router = useRouter();
  const source = useMemo(
    () =>
      getIngestResultsSource({
        runId: router.query.runId as string | undefined,
        fixture: router.query.fixture as string | undefined,
      }),
    [router.query.runId, router.query.fixture],
  );

  const [view, setView] = useState<IngestRunView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const fetchResults = useCallback(async () => {
    setView(null);
    setError(null);
    setSelection(null);
    setCurrentPage(1);
    setLoading(true);

    const endpoint =
      source.kind === "fixture"
        ? `/api/ingest-fixtures/${source.fixtureId}/view`
        : `/api/ingest/${source.runId}/view`;

    try {
      const response = await fetch(endpoint);
      if (!response.ok) {
        throw new Error(`Failed to load results: ${response.status}`);
      }
      const data = (await response.json()) as IngestRunView;
      setView(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [source]);

  useEffect(() => {
    void fetchResults();
  }, [fetchResults]);

  useEffect(() => {
    if (!view || !selection) {
      return;
    }
    const { targetPage } = resolveEvidence(selection, view.corpus.blocks);
    if (targetPage !== null) {
      setCurrentPage(targetPage);
    }
  }, [selection, view]);

  const handleFixtureChange = (fixtureId: string) => {
    void router.push(getIngestResultsPath({ kind: "fixture", fixtureId }));
  };

  const handleNewUpload = () => {
    void router.push("/ingest");
  };

  return (
    <>
      <WorkersHeader
        crumbs={[
          { title: "Ingest", href: "/ingest", id: "ingest" },
          { title: "Results", href: "#", id: "results" },
        ]}
        title={{
          Icon: InfinityLightIcon,
          text: "Ingest Results",
        }}
        hideDivider
        endElement={
          <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
            {source.kind === "fixture" && (
              <select
                value={source.fixtureId}
                onChange={(ev) => handleFixtureChange(ev.target.value)}
                style={{
                  background: "white",
                  border: "1px solid rgba(0, 0, 0, 0.23)",
                  borderRadius: "4px",
                  padding: "4px 8px",
                  fontSize: "0.8125rem",
                }}
              >
                {INGEST_FIXTURES.map((fixture) => (
                  <option key={fixture.id} value={fixture.id}>
                    {fixture.label}
                  </option>
                ))}
              </select>
            )}
            {view && (
              <Typography variant="smallTextLabels" sx={{ color: "gray.60" }}>
                {view.sourceMetadata.filename} · {view.pageImages.length} pages
                · {view.roster.entries.length} entities · {view.claims.length}{" "}
                claims
              </Typography>
            )}
          </Box>
        }
      />

      {error && (
        <Container sx={{ py: 4 }}>
          <Typography variant="h5" sx={{ color: "red.70", mb: 1 }}>
            Error loading results
          </Typography>
          <Typography variant="smallTextLabels" sx={{ mb: 2 }}>
            {error}
          </Typography>
          {source.kind === "run" && (
            <Button variant="secondary" size="small" onClick={handleNewUpload}>
              New Upload
            </Button>
          )}
        </Container>
      )}

      {!error && !view && (
        <Container sx={{ py: 4 }}>
          <Typography variant="smallTextLabels" sx={{ color: "gray.60" }}>
            {loading ? "Loading results…" : "Preparing view…"}
          </Typography>
        </Container>
      )}

      {view && (
        <Box sx={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <ResultsPanel
            rosterEntries={view.roster.entries}
            claims={view.claims}
            selection={selection}
            onSelect={setSelection}
          />
          <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
            <PageViewer
              pageImages={view.pageImages}
              blocks={view.corpus.blocks}
              highlightedBlockIds={
                selection
                  ? resolveEvidence(selection, view.corpus.blocks).blockIds
                  : []
              }
              currentPage={currentPage}
              onPageChange={setCurrentPage}
            />
            {source.kind === "run" && (
              <Button
                variant="tertiary_quiet"
                size="small"
                onClick={handleNewUpload}
                sx={{ mt: 2, color: "gray.60" }}
              >
                ← New Upload
              </Button>
            )}
          </Box>
        </Box>
      )}
    </>
  );
};

IngestResultsPage.getLayout = (page) =>
  getLayoutWithSidebar(page, { fullWidth: true });

export default IngestResultsPage;
