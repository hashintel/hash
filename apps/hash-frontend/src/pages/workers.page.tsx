import { TerminalLightIcon } from "@hashintel/design-system";
import { workerFlowFilterParam } from "@local/hash-isomorphic-utils/flows/frontend-paths";
import { Box, Container, Stack, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { useMemo } from "react";

import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar } from "../shared/layout";
import { WorkersHeader } from "../shared/workers-header";
import { FlowDefinitionsContextProvider } from "./shared/flow-definitions-context";
import { FlowRunsContextProvider } from "./shared/flow-runs-context";
import { FlowRunTable } from "./workers.page/flow-run-table";
import { FlowSchedulesTable } from "./workers.page/flow-schedules-table";

const WorkersPageContent = () => {
  const {
    query: { [workerFlowFilterParam]: definitionFilterQueryParam },
  } = useRouter();

  const flowDefinitionIdFilter = useMemo(() => {
    if (!definitionFilterQueryParam) {
      return undefined;
    }
    return Array.isArray(definitionFilterQueryParam)
      ? definitionFilterQueryParam
      : [definitionFilterQueryParam];
  }, [definitionFilterQueryParam]);

  return (
    <Box>
      <WorkersHeader
        crumbs={[
          {
            icon: null,
            id: "activity",
            title: "Activity Log",
          },
        ]}
        title={{ text: "Activity Log", Icon: TerminalLightIcon }}
        subtitle="A complete record of all worker activity in your webs"
      />
      <Container sx={{ my: 4, px: 4 }}>
        <Stack spacing={4}>
          <Box>
            <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
              Flow Runs
            </Typography>
            <FlowRunTable flowDefinitionIdFilter={flowDefinitionIdFilter} />
          </Box>

          <Box>
            <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
              Schedules
            </Typography>
            <FlowSchedulesTable />
          </Box>
        </Stack>
      </Container>
    </Box>
  );
};

const WorkersPage: NextPageWithLayout = () => {
  return (
    <FlowDefinitionsContextProvider selectedFlowDefinitionId={null}>
      <FlowRunsContextProvider selectedFlowRunId={null}>
        <WorkersPageContent />
      </FlowRunsContextProvider>
    </FlowDefinitionsContextProvider>
  );
};

WorkersPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default WorkersPage;
