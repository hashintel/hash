import type { VersionedUrl } from "@blockprotocol/type-system";
import { extractVersion } from "@blockprotocol/type-system";
import {
  AsteriskRegularIcon,
  EyeIconSolid,
  PenToSquareIconSolid,
} from "@hashintel/design-system";
import type { EntityTypeWithMetadata } from "@local/hash-graph-types/ontology";
import { isBaseUrl } from "@local/hash-graph-types/ontology";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { pluralize } from "@local/hash-isomorphic-utils/pluralize";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import type { SxProps, Theme } from "@mui/material";
import {
  Box,
  buttonClasses,
  Container,
  Fade,
  Stack,
  styled,
  Typography,
} from "@mui/material";
import { useRouter } from "next/router";
import { NextSeo } from "next-seo";
import type { FunctionComponent } from "react";
import { useCallback, useMemo } from "react";

import { useAccountPages } from "../components/hooks/use-account-pages";
import { useCreatePage } from "../components/hooks/use-create-page";
import { useHashInstance } from "../components/hooks/use-hash-instance";
import { EntityTypeEntitiesContext } from "../shared/entity-type-entities-context";
import { useEntityTypeEntitiesContextValue } from "../shared/entity-type-entities-context/use-entity-type-entities-context-value";
import { useLatestEntityTypesOptional } from "../shared/entity-types-context/hooks";
import { useEntityTypesContextRequired } from "../shared/entity-types-context/hooks/use-entity-types-context-required";
import { generateLinkParameters } from "../shared/generate-link-parameters";
import { AsteriskLightIcon } from "../shared/icons/asterisk-light-icon";
import { CanvasNewIcon } from "../shared/icons/canvas-new-icon";
import { FileCirclePlusRegularIcon } from "../shared/icons/file-circle-plus-regular-icon";
import { FilesLightIcon } from "../shared/icons/files-light-icon";
import { FilesRegularIcon } from "../shared/icons/files-regular-icon";
import { PlusRegularIcon } from "../shared/icons/plus-regular";
import type { NextPageWithLayout } from "../shared/layout";
import { getLayoutWithSidebar } from "../shared/layout";
import { Button } from "../shared/ui";
import { TabLink } from "../shared/ui/tab-link";
import { Tabs } from "../shared/ui/tabs";
import { useUserPermissionsOnEntityType } from "../shared/use-user-permissions-on-entity-type";
import type { Breadcrumb } from "./shared/breadcrumbs";
import { EntitiesTable } from "./shared/entities-table";
import { TopContextBar } from "./shared/top-context-bar";
import { useEnabledFeatureFlags } from "./shared/use-enabled-feature-flags";
import { useActiveWorkspace } from "./shared/workspace-context";

const contentMaxWidth = 1000;

type ParsedQueryParams = {
  entityTypeIdOrBaseUrl?: string;
};

export const CreateButton = styled(Button)(({ theme }) => ({
  color: theme.palette.gray[90],
  fontSize: 14,
  padding: 0,
  transition: theme.transitions.create("color"),
  ":hover": {
    background: "transparent",
    color: theme.palette.blue[70],
    [`.${buttonClasses.endIcon}`]: {
      color: theme.palette.blue[70],
    },
  },
  [`.${buttonClasses.endIcon}`]: {
    color: theme.palette.blue[70],
  },
}));

export const CreateButtons: FunctionComponent<{
  entityType?: EntityTypeWithMetadata;
}> = ({ entityType }) => {
  const router = useRouter();
  const { activeWorkspaceOwnedById, activeWorkspace } = useActiveWorkspace();

  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const { lastRootPageIndex } = useAccountPages(activeWorkspaceOwnedById);
  const [createUntitledPage] = useCreatePage({
    shortname: activeWorkspace?.shortname,
    ownedById: activeWorkspaceOwnedById,
  });

  const isFileEntityType = useMemo(
    () =>
      entityType
        ? isSpecialEntityTypeLookup?.[entityType.schema.$id]?.isFile
        : false,
    [isSpecialEntityTypeLookup, entityType],
  );

  const createDocument = useCallback(async () => {
    await createUntitledPage(lastRootPageIndex, "document");
  }, [lastRootPageIndex, createUntitledPage]);

  const createCanvas = useCallback(async () => {
    await createUntitledPage(lastRootPageIndex, "canvas");
  }, [lastRootPageIndex, createUntitledPage]);

  const createEntity = useCallback(async () => {
    await router.push(
      /**
       * If the entity type is a file entity type, we want to redirect the
       * user to the upload tab of the entity type page instead of the
       * entity editor.
       */
      entityType && isFileEntityType
        ? `${generateLinkParameters(entityType.schema.$id).href}?tab=upload`
        : `/new/entity${
            entityType
              ? `?entity-type-id=${encodeURIComponent(entityType.schema.$id)}`
              : ""
          }`,
    );
  }, [entityType, isFileEntityType, router]);

  const isViewAllPagesPage = useMemo(() => {
    return entityType?.schema.$id === systemEntityTypes.page.entityTypeId;
  }, [entityType]);

  const isViewAllDocumentsPage = useMemo(() => {
    return entityType?.schema.$id === systemEntityTypes.document.entityTypeId;
  }, [entityType]);

  const isViewAllCanvasesPage = useMemo(() => {
    return entityType?.schema.$id === systemEntityTypes.canvas.entityTypeId;
  }, [entityType]);

  const enabledFeatureFlags = useEnabledFeatureFlags();

  return isViewAllPagesPage ||
    isViewAllDocumentsPage ||
    isViewAllCanvasesPage ? (
    <Box display="flex" gap={3}>
      {(isViewAllPagesPage || isViewAllDocumentsPage) &&
      enabledFeatureFlags.pages &&
      enabledFeatureFlags.documents ? (
        <CreateButton
          variant="tertiary_quiet"
          endIcon={<FileCirclePlusRegularIcon />}
          onClick={createDocument}
        >
          Create new document
        </CreateButton>
      ) : null}
      {(isViewAllPagesPage || isViewAllCanvasesPage) &&
      enabledFeatureFlags.pages &&
      enabledFeatureFlags.canvases ? (
        <CreateButton
          variant="tertiary_quiet"
          sx={{
            [`.${buttonClasses.endIcon}`]: {
              fontSize: 18,
            },
          }}
          endIcon={<CanvasNewIcon />}
          onClick={createCanvas}
        >
          Create new canvas
        </CreateButton>
      ) : null}
    </Box>
  ) : (
    <CreateButton
      onClick={createEntity}
      variant="tertiary_quiet"
      endIcon={<PlusRegularIcon />}
    >
      {isFileEntityType ? "Add" : "Create"} new{" "}
      {entityType?.schema.title.toLowerCase() ?? "entity"}
      {isFileEntityType ? "(s)" : ""}
    </CreateButton>
  );
};

const typeIconSx: SxProps<Theme> = {
  ml: 1,
  fill: ({ palette }) => palette.common.white,
  fontSize: 14,
};

const EntitiesPage: NextPageWithLayout = () => {
  const router = useRouter();

  const { hashInstance } = useHashInstance();

  const { entityTypeId, entityTypeBaseUrl } = useMemo(() => {
    if (router.isReady) {
      const { entityTypeIdOrBaseUrl } = router.query as ParsedQueryParams;

      return {
        entityTypeId:
          entityTypeIdOrBaseUrl && !isBaseUrl(entityTypeIdOrBaseUrl)
            ? (entityTypeIdOrBaseUrl as VersionedUrl)
            : undefined,
        entityTypeBaseUrl:
          entityTypeIdOrBaseUrl && isBaseUrl(entityTypeIdOrBaseUrl)
            ? entityTypeIdOrBaseUrl
            : undefined,
      };
    }
    return {};
  }, [router]);

  const { latestEntityTypes } = useLatestEntityTypesOptional({
    includeArchived: true,
  });

  const entityType = useMemo(
    () =>
      (entityTypeId ?? entityTypeBaseUrl)
        ? latestEntityTypes?.find(({ schema }) =>
            entityTypeId
              ? schema.$id === entityTypeId
              : extractBaseUrl(schema.$id) === entityTypeBaseUrl,
          )
        : undefined,
    [latestEntityTypes, entityTypeId, entityTypeBaseUrl],
  );

  const entityTypeEntitiesValue = useEntityTypeEntitiesContextValue({
    entityTypeBaseUrl,
    entityTypeId,
  });

  const { userPermissions, loading: userPermissionsLoading } =
    useUserPermissionsOnEntityType(entityType?.schema.$id);

  const isViewAllPagesPage =
    entityType && entityType.schema.$id === systemEntityTypes.page.entityTypeId;

  const pageTitle = entityType
    ? entityTypeId
      ? `${entityType.schema.title} v${extractVersion(entityTypeId)}`
      : pluralize(entityType.schema.title)
    : "Entities";

  const { entities, loading } = entityTypeEntitiesValue;

  const displayCreateEntityButton = useMemo(() => {
    if (userPermissionsLoading) {
      return false;
    }

    if (userPermissions && !userPermissions.instantiate) {
      return false;
    }

    if (isViewAllPagesPage) {
      return hashInstance?.properties.pagesAreEnabled;
    }

    return true;
  }, [
    isViewAllPagesPage,
    hashInstance,
    userPermissions,
    userPermissionsLoading,
  ]);

  const breadcrumbs = useMemo(() => {
    const rootCrumb = {
      title: "Entities",
      href: entityType ? "/entities" : undefined,
      id: "entities",
      icon: <AsteriskRegularIcon />,
    };
    const crumbs: Breadcrumb[] = [rootCrumb];

    if (entityType) {
      crumbs.push({
        title: pageTitle,
        id: pageTitle,
        icon: isViewAllPagesPage ? (
          <FilesRegularIcon />
        ) : (
          <AsteriskRegularIcon />
        ),
      });
    }

    return crumbs;
  }, [entityType, isViewAllPagesPage, pageTitle]);

  return (
    <>
      <NextSeo title={pageTitle} />
      <TopContextBar
        defaultCrumbIcon={null}
        crumbs={breadcrumbs}
        scrollToTop={() => {}}
      />
      <Box
        sx={{
          borderBottom: 1,
          borderColor: ({ palette }) => palette.gray[20],
          pt: 3.75,
          backgroundColor: ({ palette }) => palette.common.white,
        }}
      >
        <Container sx={{ maxWidth: { lg: contentMaxWidth } }}>
          <Stack direction="row" justifyContent="space-between">
            <Typography variant="h1" fontWeight="bold" my={3}>
              <Box
                display="inline-flex"
                sx={({ palette }) => ({
                  svg: {
                    fontSize: 40,
                    mr: 2,
                    color: palette.gray[70],
                    verticalAlign: "middle",
                  },
                })}
              >
                {isViewAllPagesPage ? (
                  <FilesLightIcon />
                ) : (
                  <AsteriskLightIcon />
                )}
              </Box>
              {pageTitle}
            </Typography>
            {entityType && (
              <Button
                href={generateLinkParameters(entityType.schema.$id).href}
                size="small"
                sx={{ alignSelf: "center" }}
              >
                {userPermissions?.edit ? "Edit" : "View"} Type
                {userPermissions?.edit ? (
                  <PenToSquareIconSolid sx={typeIconSx} />
                ) : (
                  <EyeIconSolid sx={typeIconSx} />
                )}
              </Button>
            )}
          </Stack>
          <Box display="flex" justifyContent="space-between">
            <Tabs value="all">
              <TabLink
                href="/"
                value="all"
                active
                label={`All ${pageTitle}`}
                count={entities?.length}
                loading={loading}
              />
            </Tabs>
            <Fade in={displayCreateEntityButton}>
              <Box>
                <CreateButtons entityType={entityType} />
              </Box>
            </Fade>
          </Box>
        </Container>
      </Box>
      <Container sx={{ maxWidth: { lg: contentMaxWidth }, py: 5 }}>
        <EntityTypeEntitiesContext.Provider value={entityTypeEntitiesValue}>
          <EntitiesTable
            hideEntityTypeVersionColumn={!!entityTypeId}
            hidePropertiesColumns
          />
        </EntityTypeEntitiesContext.Provider>
      </Container>
    </>
  );
};

EntitiesPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default EntitiesPage;
