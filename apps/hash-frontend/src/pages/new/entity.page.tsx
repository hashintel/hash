import { validateVersionedUrl, VersionedUrl } from "@blockprotocol/type-system";
import { Container, Paper, Typography } from "@mui/material";
import { useRouter } from "next/router";
import {
  FunctionComponent,
  PropsWithChildren,
  useContext,
  useMemo,
} from "react";

import { useEntityTypesContextRequired } from "../../shared/entity-types-context/hooks/use-entity-types-context-required";
import { getLayoutWithSidebar, NextPageWithLayout } from "../../shared/layout";
import { Link } from "../../shared/ui/link";
import { useUserPermissionsOnEntityType } from "../../shared/use-user-permissions-on-entity-type";
import { CreateEntityPage } from "../[shortname]/entities/[entity-uuid].page/create-entity-page";
import { EntityPageLoadingState } from "../[shortname]/entities/[entity-uuid].page/entity-page-loading-state";
import { SelectEntityTypePage } from "../[shortname]/entities/[entity-uuid].page/select-entity-type-page";
import { WorkspaceContext } from "../shared/workspace-context";

const CreateEntityError: FunctionComponent<
  PropsWithChildren<{
    entityTypeId?: VersionedUrl;
  }>
> = ({ entityTypeId, children }) => {
  const { entityTypes } = useEntityTypesContextRequired();

  const linkEntityType = useMemo(
    () => entityTypes?.find(({ schema }) => schema.$id === entityTypeId),
    [entityTypes, entityTypeId],
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
        {children}
      </Paper>
    </Container>
  );
};

const Page: NextPageWithLayout = () => {
  const router = useRouter();
  const queryEntityId = router.query["entity-type-id"]?.toString();
  const entityTypeId = !queryEntityId
    ? null
    : validateVersionedUrl(queryEntityId);

  const isValidEntityTypeId = entityTypeId?.type === "Ok";

  const { userPermissions, loading: userPermissionsLoading } =
    useUserPermissionsOnEntityType(
      isValidEntityTypeId ? entityTypeId.inner : undefined,
    );

  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const isLinkEntity = useMemo(
    () =>
      isValidEntityTypeId
        ? isSpecialEntityTypeLookup?.[entityTypeId.inner]?.isLink
        : undefined,
    [entityTypeId?.inner, isSpecialEntityTypeLookup, isValidEntityTypeId],
  );

  const { activeWorkspace } = useContext(WorkspaceContext);
  const shouldBeCreatingEntity = entityTypeId?.type === "Ok";

  if (
    userPermissionsLoading ||
    !activeWorkspace ||
    (entityTypeId?.type === "Ok" && typeof isLinkEntity === "undefined")
  ) {
    return <EntityPageLoadingState />;
  }

  if (isLinkEntity) {
    return (
      <CreateEntityError
        entityTypeId={
          entityTypeId?.type === "Ok" ? entityTypeId.inner : undefined
        }
      >
        <Typography textAlign="center">
          Create links by editing the entity that you want to link from.
        </Typography>
      </CreateEntityError>
    );
  }

  if (userPermissions && !userPermissions?.instantiate) {
    return (
      <CreateEntityError
        entityTypeId={
          entityTypeId?.type === "Ok" ? entityTypeId.inner : undefined
        }
      >
        <Typography textAlign="center">
          You don't have permission to create entities of this type.
        </Typography>
        <Typography textAlign="center" mt={2}>
          Go back and <Link href="/new/entity">select another type</Link>
        </Typography>
      </CreateEntityError>
    );
  }

  if (shouldBeCreatingEntity) {
    return <CreateEntityPage entityTypeId={entityTypeId.inner} />;
  }

  return <SelectEntityTypePage />;
};

Page.getLayout = (page) => getLayoutWithSidebar(page, { fullWidth: true });

export default Page;
