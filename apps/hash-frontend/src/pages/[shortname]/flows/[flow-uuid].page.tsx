import type { NextPageWithLayout } from "../../../shared/layout";
import { getLayoutWithSidebar } from "../../../shared/layout";
import { FlowDefinitionsContextProvider } from "../../shared/flow-definitions-context";
import { FlowRunsContextProvider } from "../../shared/flow-runs-context";
import { FlowDefinition } from "./[flow-uuid].page/flow-definition";

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
