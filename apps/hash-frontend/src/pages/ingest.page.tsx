import { InfinityLightIcon } from "@hashintel/design-system";
import {
  Box,
  Container,
  FormControlLabel,
  Radio,
  RadioGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import { useRouter } from "next/router";
import { useCallback, useEffect } from "react";

import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar } from "../shared/layout";
import { WorkersHeader } from "../shared/workers-header";
import { getIngestPageNavigationAction } from "./ingest.page/navigation";
import { UploadPanel } from "./ingest.page/upload-panel";
import { useIngestRun } from "./ingest.page/use-ingest-run";

const normalizeQueryParam = (
  value: string | string[] | undefined,
): string | undefined => (typeof value === "string" ? value : value?.[0]);

const IngestPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { state, upload, reset, resume } = useIngestRun();
  const runId = normalizeQueryParam(router.query.runId);

  const handleReset = useCallback(() => {
    const navigationAction = getIngestPageNavigationAction({
      kind: "reset",
      currentRunId: runId,
      state,
    });

    reset();

    if (!navigationAction) {
      return;
    }

    void router.replace(navigationAction.path, undefined, { shallow: true });
  }, [reset, router, runId, state]);

  useEffect(() => {
    if (!router.isReady || !runId) {
      return;
    }

    void (async () => {
      const resumeOutcome = await resume(runId);

      const navigationAction = getIngestPageNavigationAction({
        kind: "resume",
        currentRunId: runId,
        resumeOutcome,
      });

      if (!navigationAction) {
        return;
      }

      void router.replace(navigationAction.path, undefined, { shallow: true });
    })();
  }, [resume, router, router.isReady, runId]);

  useEffect(() => {
    const navigationAction = getIngestPageNavigationAction({
      kind: "state",
      currentRunId: runId,
      state,
    });

    if (!navigationAction) {
      return;
    }

    if (navigationAction.kind === "replace") {
      void router.replace(navigationAction.path, undefined, { shallow: true });
      return;
    }

    void router.push(navigationAction.path);
  }, [router, runId, state]);

  return (
    <>
      <WorkersHeader
        crumbs={[
          {
            title: "Ingest",
            href: "/ingest",
            id: "ingest",
          },
        ]}
        title={{
          Icon: InfinityLightIcon,
          text: "Ingest",
        }}
        subtitle="Upload a PDF to extract entities, claims, and evidence."
      />
      <Container>
        <Box
          sx={{
            display: "flex",
            gap: 4,
            py: 4,
            minHeight: 400,
          }}
        >
          {/* Left panel: upload */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <UploadPanel
              state={state}
              onUpload={upload}
              onReset={handleReset}
            />
          </Box>

          {/* Right panel: extraction mode */}
          <Box
            sx={{
              width: 280,
              flexShrink: 0,
              p: 3,
              border: ({ palette }) => `1px solid ${palette.gray[20]}`,
              borderRadius: 2,
              alignSelf: "flex-start",
            }}
          >
            <Typography
              variant="smallTextLabels"
              sx={{ fontWeight: 600, mb: 2 }}
            >
              Extraction Mode
            </Typography>
            <RadioGroup defaultValue="open">
              <FormControlLabel
                value="open"
                control={<Radio size="small" />}
                label={
                  <Typography variant="smallTextLabels">
                    Open Extraction
                  </Typography>
                }
              />
              <Tooltip title="Coming soon" placement="right">
                <FormControlLabel
                  value="targeted"
                  control={<Radio size="small" disabled />}
                  label={
                    <Typography
                      variant="smallTextLabels"
                      sx={{ color: "gray.50" }}
                    >
                      Targeted Extraction
                    </Typography>
                  }
                />
              </Tooltip>
            </RadioGroup>
            <Typography variant="microText" sx={{ color: "gray.50", mt: 2 }}>
              Open extraction discovers entities and claims without type
              constraints. Targeted extraction lets you specify ontology types
              to extract.
            </Typography>
          </Box>
        </Box>
      </Container>
    </>
  );
};

IngestPage.getLayout = (page) =>
  getLayoutWithSidebar(page, { fullWidth: true });

export default IngestPage;
