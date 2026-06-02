import { InfinityLightIcon } from "@hashintel/design-system";
import { Box, Container } from "@mui/material";
import { useRouter } from "next/router";
import { useEffect } from "react";

import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar } from "../shared/layout";
import { WorkersHeader } from "../shared/workers-header";
import { getIngestResultsPath } from "./ingest.page/routing";
import { UploadPanel } from "./ingest.page/upload-panel";
import { shouldFetchResults, useIngestRun } from "./ingest.page/use-ingest-run";

const IngestPage: NextPageWithLayout = () => {
  const router = useRouter();
  const { state, upload, reset } = useIngestRun();

  useEffect(() => {
    if (!shouldFetchResults(state)) {
      return;
    }
    void router.push(
      getIngestResultsPath({
        kind: "run",
        runId: state.runStatus.runId,
      }),
    );
  }, [router, state]);

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
            alignItems: "center",
            justifyContent: "center",
            minHeight: 400,
            py: 4,
          }}
        >
          <UploadPanel state={state} onUpload={upload} onReset={reset} />
        </Box>
      </Container>
    </>
  );
};

IngestPage.getLayout = (page) =>
  getLayoutWithSidebar(page, { fullWidth: true });

export default IngestPage;
