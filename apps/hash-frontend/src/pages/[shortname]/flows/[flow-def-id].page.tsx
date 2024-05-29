import type { EntityUuid } from "@local/hash-graph-types/entity";
import { useRouter } from "next/router";

import type { NextPageWithLayout } from "../../../shared/layout";
import { getLayoutWithSidebar } from "../../../shared/layout";
import { FlowDefinitionsContextProvider } from "../../shared/flow-definitions-context";
import { FlowRunsContextProvider } from "../../shared/flow-runs-context";
import { FlowVisualizer } from "../shared/flow-visualizer";

const FlowDefinitionPage: NextPageWithLayout = () => {
  const { query } = useRouter();

  /** @todo replace with real uuid once flow definitions are stored in the db */
  const routeFlowDefinitionId = query["flow-def-id"] as EntityUuid;

  return (
    <FlowDefinitionsContextProvider
      selectedFlowDefinitionId={routeFlowDefinitionId}
    >
      <FlowRunsContextProvider selectedFlowRunId={null}>
        <FlowVisualizer />
      </FlowRunsContextProvider>
    </FlowDefinitionsContextProvider>
  );
};

FlowDefinitionPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default FlowDefinitionPage;
