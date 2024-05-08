import type { NextPageWithLayout } from "../../shared/layout";
import { getLayoutWithSidebar } from "../../shared/layout";
import { FlowDefinition } from "./flows.page/flow-definition";
import { FlowDefinitionsContextProvider } from "../shared/flow-definitions-context";
import { FlowRunsContextProvider } from "./flows.page/flow-definition/shared/flow-runs-context";

const FlowsDefinitionPage: NextPageWithLayout = () => {
  return (
    <FlowDefinitionsContextProvider>
      <FlowRunsContextProvider>
        <FlowDefinition />
      </FlowRunsContextProvider>
    </FlowDefinitionsContextProvider>
  );
};

FlowsDefinitionPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default FlowsDefinitionPage;
