import { useRouter } from "next/router";

import { entityIdFromComponents } from "@blockprotocol/type-system";

import { getLayoutWithSidebar } from "../../../../shared/layout";
import { FlowDefinitionsContextProvider } from "../../../shared/flow-definitions-context-provider";
import { FlowRunsContextProvider } from "../../../shared/flow-runs-context-provider";
import { NotFound } from "../../../shared/not-found";
import {
  FlowRunVisualizerSkeleton,
  FlowVisualizer,
} from "../shared/flow-visualizer";
import { useRouteNamespace } from "../shared/use-route-namespace";

import type { NextPageWithLayout } from "../../../../shared/layout";
import type { EntityUuid } from "@blockprotocol/type-system";

const FlowDefinitionPage: NextPageWithLayout = () => {
  const { query } = useRouter();

  const routeFlowDefinitionUuid = query["flow-def-id"] as EntityUuid;

  /* The path has the uuid of the definition's entity, and its shortname names the web the definition is in. */
  const { loading, routeNamespace } = useRouteNamespace();

  if (!routeNamespace) {
    return loading ? <FlowRunVisualizerSkeleton /> : <NotFound />;
  }

  const flowDefinitionEntityId = entityIdFromComponents(
    routeNamespace.webId,
    routeFlowDefinitionUuid,
  );

  return (
    <FlowDefinitionsContextProvider
      selectedFlowDefinitionEntityId={flowDefinitionEntityId}
    >
      <FlowRunsContextProvider selectedFlowRunEntityId={null}>
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
