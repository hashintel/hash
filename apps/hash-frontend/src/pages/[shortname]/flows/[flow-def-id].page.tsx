import type { NextPageWithLayout } from "../../../shared/layout";
import { getLayoutWithSidebar } from "../../../shared/layout";
import { FlowDefinitionsContextProvider } from "../../shared/flow-definitions-context";
import { FlowRunsContextProvider } from "../../shared/flow-runs-context";
import { FlowVisualizer } from "../shared/flow-visualizer";

const FlowDefinitionPage: NextPageWithLayout = () => {
  return (
    <FlowDefinitionsContextProvider>
      <FlowRunsContextProvider>
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
