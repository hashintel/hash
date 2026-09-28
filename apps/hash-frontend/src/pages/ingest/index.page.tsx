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

import { InfinityLightIcon } from "@hashintel/design-system";

import { isIngestEnabled } from "../../lib/public-env";
import { getLayoutWithSidebar } from "../../shared/layout";
import { WorkersHeader } from "../../shared/workers-header";
import { UploadPanel } from "./index.page/upload-panel";
import { useIngestRun } from "./index.page/use-ingest-run";
import { getIngestPath, getIngestResultsPath } from "./shared/routing";

import type { NextPageWithLayout } from "../../shared/layout";
import type { GetServerSideProps } from "next";

const normalizeQueryParam = (
  value: string | string[] | undefined,
): string | undefined => (typeof value === "string" ? value : value?.[0]);

export const getServerSideProps: GetServerSideProps = () =>
  Promise.resolve(isIngestEnabled ? { props: {} } : { notFound: true });

const IngestPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { state, upload, reset, resume } = useIngestRun();
  const runId = normalizeQueryParam(router.query.runId);

  const handleReset = useCallback(() => {
    reset();

    if (runId) {
      void router.replace(getIngestPath(), undefined, { shallow: true });
    }
  }, [reset, router, runId]);

  useEffect(() => {
    if (router.isReady && runId) {
      resume(runId);
    }
  }, [resume, router.isReady, runId]);

  useEffect(() => {
    if (state.phase === "streaming" && state.runStatus.runId !== runId) {
      void router.replace(getIngestPath(state.runStatus.runId), undefined, {
        shallow: true,
      });
    } else if (
      state.phase === "done" &&
      state.runStatus.status === "succeeded"
    ) {
      void router.push(
        getIngestResultsPath({ kind: "run", runId: state.runStatus.runId }),
      );
    }
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
