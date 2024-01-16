import { validateVersionedUrl, VersionedUrl } from "@blockprotocol/type-system";
import { Container, Paper, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { FunctionComponent, useContext, useMemo } from "react";

import { useEntityTypesContextRequired } from "../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { getLayoutWithSidebar, NextPageWithLayout } from "../../shared/layout";
import { CreateEntityPage } from "../[shortname]/entities/[entity-uuid].page/create-entity-page";
import { EntityPageLoadingState } from "../[shortname]/entities/[entity-uuid].page/entity-page-loading-state";
import { SelectEntityTypePage } from "../[shortname]/entities/[entity-uuid].page/select-entity-type-page";
import { WorkspaceContext } from "../shared/workspace-context";

const CreateLinkEntityError: FunctionComponent<{
  linkEntityTypeId?: VersionedUrl;
}> = ({ linkEntityTypeId }) => {
  const { entityTypes } = useEntityTypesContextRequired();

  const linkEntityType = useMemo(
    () => entityTypes?.find(({ schema }) => schema.$id === linkEntityTypeId),
    [entityTypes, linkEntityTypeId],
  );

  return (
    <Container
      sx={{ display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <Paper
        sx={{
          padding: 3,
          marginTop: 3,
          borderRadius: "6px",
          width: "fit-content",
        }}
      >
        <Typography variant="h3" gutterBottom textAlign="center">
          Cannot create an entity of type{" "}
          <strong>{linkEntityType?.schema.title}</strong>
        </Typography>
        <Typography textAlign="center">
          Create links with type <strong>{linkEntityType?.schema.title}</strong>{" "}
          by editing the source entity.
        </Typography>
      </Paper>
    </Container>
  );
};

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const queryEntityId = router.query["entity-type-id"]?.toString();
  const entityTypeId = !queryEntityId
    ? null
    : validateVersionedUrl(queryEntityId);

  const isLinkEntity = useMemo(
    () =>
      entityTypeId && entityTypeId.type === "Ok"
        ? isSpecialEntityTypeLookup?.[entityTypeId.inner]?.isLink
        : undefined,
    [entityTypeId, isSpecialEntityTypeLookup],
  );

  const { activeWorkspace } = useContext(WorkspaceContext);
  const shouldBeCreatingEntity = entityTypeId?.type === "Ok";

  if (!activeWorkspace || typeof isLinkEntity === "undefined") {
    return <EntityPageLoadingState />;
  }

  if (isLinkEntity) {
    return (
      <CreateLinkEntityError
        linkEntityTypeId={
          entityTypeId?.type === "Ok" ? entityTypeId.inner : undefined
        }
      />
    );
  }

  if (shouldBeCreatingEntity) {
    return <CreateEntityPage entityTypeId={entityTypeId.inner} />;
  }

  return <SelectEntityTypePage />;
};

Page.getLayout = (page) => getLayoutWithSidebar(page, { fullWidth: true });

export default Page;
