import { Box, Typography } from "@mui/material";
import { useRouter } from "next/router";

import { entityIdFromComponents } from "@blockprotocol/type-system";

import { getLayoutWithSidebar } from "../../../../shared/layout";
import { FlowDefinitionsContextProvider } from "../../../shared/flow-definitions-context-provider";
import { useFlowRunsContext } from "../../../shared/flow-runs-context";
import { FlowRunsContextProvider } from "../../../shared/flow-runs-context-provider";
import {
  FlowRunVisualizerSkeleton,
  FlowVisualizer,
} from "../shared/flow-visualizer";
import { useRouteNamespace } from "../shared/use-route-namespace";

import type { NextPageWithLayout } from "../../../../shared/layout";
import type { EntityUuid } from "@blockprotocol/type-system";

const WorkerFlowDefinitionResolver = () => {
  const { selectedFlowRun, selectedFlowRunEventsFailure } =
    useFlowRunsContext();

  if (!selectedFlowRun) {
    return selectedFlowRunEventsFailure ? (
      <Box px={3} py={2}>
        <Typography
          variant="smallTextParagraphs"
          sx={({ palette }) => ({ color: palette.red[80] })}
        >
          Couldn't load this run's events: {selectedFlowRunEventsFailure}
        </Typography>
      </Box>
    ) : (
      <FlowRunVisualizerSkeleton />
    );
  }

  return (
    <FlowDefinitionsContextProvider
      selectedFlowDefinitionEntityId={selectedFlowRun.flowDefinitionEntityId}
    >
      <FlowVisualizer />
    </FlowDefinitionsContextProvider>
  );
};

const WorkerRunPage: NextPageWithLayout = () => {
  const { query } = useRouter();

  const routeFlowRunUuid = query["run-id"] as EntityUuid;

  /* The path has the uuid of the run's entity, and its shortname names the web the run is in. */
  const { routeNamespace } = useRouteNamespace();

  const flowRunEntityId = routeNamespace
    ? entityIdFromComponents(routeNamespace.webId, routeFlowRunUuid)
    : null;

  return (
    <FlowRunsContextProvider selectedFlowRunEntityId={flowRunEntityId}>
      <WorkerFlowDefinitionResolver />
    </FlowRunsContextProvider>
  );
};

WorkerRunPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default WorkerRunPage;
