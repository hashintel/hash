import { useRouter } from "next/router";

import { getLayoutWithSidebar } from "../../../../shared/layout";
import { FlowDefinitionsContextProvider } from "../../../shared/flow-definitions-context-provider";
import { useFlowRunsContext } from "../../../shared/flow-runs-context";
import { FlowRunsContextProvider } from "../../../shared/flow-runs-context-provider";
import {
  FlowRunVisualizerSkeleton,
  FlowVisualizer,
} from "../shared/flow-visualizer";

import type { NextPageWithLayout } from "../../../../shared/layout";
import type { EntityUuid } from "@blockprotocol/type-system";

const WorkerFlowDefinitionResolver = () => {
  const { selectedFlowRun } = useFlowRunsContext();

  if (!selectedFlowRun) {
    return <FlowRunVisualizerSkeleton />;
  }

  return (
    <FlowDefinitionsContextProvider
      selectedFlowDefinitionId={selectedFlowRun.flowDefinitionId as EntityUuid}
    >
      <FlowVisualizer />
    </FlowDefinitionsContextProvider>
  );
};

const WorkerRunPage: NextPageWithLayout = () => {
  const { query } = useRouter();

  const routeFlowRunId = query["run-id"] as string;

  return (
    <FlowRunsContextProvider selectedFlowRunId={routeFlowRunId}>
      <WorkerFlowDefinitionResolver />
    </FlowRunsContextProvider>
  );
};

WorkerRunPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default WorkerRunPage;
