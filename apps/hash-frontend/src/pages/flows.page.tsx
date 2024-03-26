import type { NextPageWithLayout } from "next";
import { ReactFlowProvider } from "reactflow";

import { getLayoutWithSidebar } from "../shared/layout";
import { FlowDefinition } from "./flows.page/flow-definition";
import { FlowDefinitionsContextProvider } from "./flows.page/flow-definition/shared/flow-definitions-context";

const FlowsPage: NextPageWithLayout = () => {
  return (
    <FlowDefinitionsContextProvider>
      <ReactFlowProvider>
        <FlowDefinition />
      </ReactFlowProvider>
    </FlowDefinitionsContextProvider>
  );
};

FlowsPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default FlowsPage;
