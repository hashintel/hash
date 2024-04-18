import { getLayoutWithSidebar, NextPageWithLayout } from "../shared/layout";
import { FlowDefinition } from "./flows.page/flow-definition";
import { FlowDefinitionsContextProvider } from "./flows.page/flow-definition/shared/flow-definitions-context";
import { FlowRunsContextProvider } from "./flows.page/flow-definition/shared/flow-runs-context";

const FlowsPage: NextPageWithLayout = () => {
  return (
    <FlowDefinitionsContextProvider>
      <FlowRunsContextProvider>
        <FlowDefinition />
      </FlowRunsContextProvider>
    </FlowDefinitionsContextProvider>
  );
};

FlowsPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default FlowsPage;
