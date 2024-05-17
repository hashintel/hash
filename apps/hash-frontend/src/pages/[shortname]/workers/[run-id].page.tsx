import { useRouter } from "next/router";
import type { EntityUuid } from "@local/hash-subgraph";
import type { NextPageWithLayout } from "../../../shared/layout";
import { getLayoutWithSidebar } from "../../../shared/layout";
import { FlowDefinitionsContextProvider } from "../../shared/flow-definitions-context";
import {
  FlowRunsContextProvider,
  useFlowRunsContext,
} from "../../shared/flow-runs-context";
import {
  FlowRunVisualizerSkeleton,
  FlowVisualizer,
} from "../shared/flow-visualizer";

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
