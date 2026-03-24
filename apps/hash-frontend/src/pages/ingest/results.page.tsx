import { InfinityLightIcon } from "@hashintel/design-system";
import { Box, Container, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef, useState } from "react";

import type { NextPageWithLayout } from "../../shared/layout";
import { getLayoutWithSidebar } from "../../shared/layout";
import { Button } from "../../shared/ui/button";
import { WorkersHeader } from "../../shared/workers-header";
import type { Selection } from "../ingest.page/evidence-resolver";
import { resolveEvidence } from "../ingest.page/evidence-resolver";
import type { PageViewerHandle } from "../ingest.page/page-viewer";
import { PageViewer } from "../ingest.page/page-viewer";
import { ResultsPanel } from "../ingest.page/results-panel";
import { getIngestResultsSource } from "../ingest.page/routing";
import type { IngestRunView } from "../ingest.page/types";

const normalizeQueryParam = (
  value: string | string[] | undefined,
): string | undefined => (typeof value === "string" ? value : value?.[0]);

const IngestResultsPage: NextPageWithLayout = () => {
  const router = useRouter();
  const source = useMemo(
    () =>
      getIngestResultsSource({
        runId: normalizeQueryParam(router.query.runId),
        fixture: normalizeQueryParam(router.query.fixture),
      }),
    [router.query.fixture, router.query.runId],
  );

  const [view, setView] = useState<IngestRunView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [loading, setLoading] = useState(false);
  const pageViewerRef = useRef<PageViewerHandle>(null);

  useEffect(() => {
    const abortController = new AbortController();

    setView(null);
    setError(null);
    setSelection(null);
    setLoading(true);

    const endpoint =
      source.kind === "fixture"
        ? `/api/ingest-fixtures/${encodeURIComponent(source.fixtureId)}/view`
        : `/api/ingest/${encodeURIComponent(source.runId)}/view`;

    void (async () => {
      try {
        const response = await fetch(endpoint, {
          signal: abortController.signal,
        });
        if (!response.ok) {
          throw new Error(`Failed to load results: ${response.status}`);
        }
        const data = (await response.json()) as IngestRunView;
        if (!abortController.signal.aborted) {
          setView(data);
        }
      } catch (err) {
        if (
          abortController.signal.aborted ||
          (err instanceof Error && err.name === "AbortError")
        ) {
          return;
        }

        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      abortController.abort();
    };
  }, [source]);

  const evidence = useMemo(
    () =>
      view && selection
        ? resolveEvidence(selection, view.corpus.blocks)
        : { blockIds: [], targetPage: null },
    [selection, view],
  );

  useEffect(() => {
    if (evidence.targetPage !== null) {
      pageViewerRef.current?.scrollToPage(evidence.targetPage);
    }
  }, [evidence]);

  const handleNewUpload = () => {
    void router.push("/ingest");
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        position: "absolute",
        inset: 0,
      }}
    >
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
        <Box
          sx={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}
        >
          <ResultsPanel
            rosterEntries={view.roster.entries}
            claims={view.claims}
            mentionContexts={view.mentionContexts}
            selection={selection}
            onSelect={setSelection}
          />
          <Box
            sx={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              minWidth: 0,
              overflow: "hidden",
            }}
          >
            <Box
              sx={{
                flexShrink: 0,
                px: 2,
                py: 1.5,
                borderBottom: ({ palette }) => `1px solid ${palette.gray[30]}`,
                bgcolor: "white",
              }}
            >
              <Typography
                sx={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  lineHeight: 1,
                }}
              >
                {view.sourceMetadata.filename}
              </Typography>
              <Typography
                variant="microText"
                sx={{ color: "gray.50", mt: 0.5 }}
              >
                {view.pageImages.length} pages · {view.roster.entries.length}{" "}
                entities · {view.claims.length} claims
              </Typography>
            </Box>
            <Box
              sx={{
                flex: 1,
                overflow: "auto",
                p: 2,
                maxWidth: 780,
                mx: "auto",
              }}
            >
              <PageViewer
                ref={pageViewerRef}
                pageImages={view.pageImages}
                blocks={view.corpus.blocks}
                highlightedBlockIds={evidence.blockIds}
              />
            </Box>
          </Box>
        </Box>
      )}

      {view && (
        <Box
          sx={{
            flexShrink: 0,
            borderTop: ({ palette }) => `1px solid ${palette.gray[20]}`,
            px: 2,
            py: 1,
            display: "flex",
            alignItems: "center",
          }}
        >
          <Button
            variant="tertiary_quiet"
            size="small"
            onClick={handleNewUpload}
            sx={{ color: "gray.60" }}
          >
            ← New Upload
          </Button>
        </Box>
      )}
    </Box>
  );
};

IngestResultsPage.getLayout = (page) =>
  getLayoutWithSidebar(page, { fullWidth: true });

export default IngestResultsPage;
