import type { NextPageWithLayout } from "next";

import { getLayoutWithSidebar } from "../shared/layout";
import { FlowDefinition } from "./flows.page/flow-definition";
import { FlowDefinitionsContextProvider } from "./flows.page/flow-definition/shared/flow-definitions-context";

const FlowsPage: NextPageWithLayout = () => {
  return (
    <FlowDefinitionsContextProvider>
      <FlowDefinition />
    </FlowDefinitionsContextProvider>
  );
};

FlowsPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default FlowsPage;
