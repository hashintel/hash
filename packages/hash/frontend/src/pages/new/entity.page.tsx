import { validateVersionedUri } from "@blockprotocol/type-system";
import { useRouter } from "next/router";
import { useContext } from "react";
import { useInitTypeSystem } from "../../lib/use-init-type-system";
import { getLayoutWithSidebar, NextPageWithLayout } from "../../shared/layout";
import { EntityPageLoadingState } from "../[shortname]/entities/[entity-uuid].page/entity-page-loading-state";
import { SelectEntityTypePage } from "../[shortname]/entities/[entity-uuid].page/select-entity-type-page";
import { WorkspaceContext } from "../shared/workspace-context";
import { CreateEntityPage } from "../[shortname]/entities/[entity-uuid].page/create-entity-page";

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const loadingTypeSystem = useInitTypeSystem();
  const queryEntityId = router.query["entity-type-id"]?.toString();
  const entityTypeId =
    loadingTypeSystem || !queryEntityId
      ? null
      : validateVersionedUri(queryEntityId);

  const { activeWorkspace } = useContext(WorkspaceContext);
  const shouldBeCreatingEntity = entityTypeId?.type === "Ok";

  if (!activeWorkspace || loadingTypeSystem) {
    return <EntityPageLoadingState />;
  }

  if (shouldBeCreatingEntity) {
    return <CreateEntityPage entityTypeId={entityTypeId.inner} />;
  }

  return <SelectEntityTypePage />;
};

Page.getLayout = (page) => getLayoutWithSidebar(page, { fullWidth: true });

export default Page;
