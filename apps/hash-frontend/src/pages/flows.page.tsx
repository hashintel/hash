import type { NextPageWithLayout } from "next";
import { ReactFlowProvider } from "reactflow";

import { getLayoutWithSidebar } from "../shared/layout";
import { FlowDefinition } from "./flows.page/flow-definition";
import { FlowDefinitionsContextProvider } from "./flows.page/flow-definition/shared/flow-definitions-context";
import { FlowRunsContextProvider } from "./flows.page/flow-definition/shared/flow-runs-context";

const FlowsPage: NextPageWithLayout = () => {
  return (
    <FlowDefinitionsContextProvider>
      <FlowRunsContextProvider>
        <ReactFlowProvider>
          <FlowDefinition />
        </ReactFlowProvider>
      </FlowRunsContextProvider>
    </FlowDefinitionsContextProvider>
  );
};

FlowsPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default FlowsPage;
