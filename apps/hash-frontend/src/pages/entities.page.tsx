import { extractVersion, VersionedUrl } from "@blockprotocol/type-system";
import { AsteriskRegularIcon } from "@hashintel/design-system";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { pluralize } from "@local/hash-isomorphic-utils/pluralize";
import { EntityTypeWithMetadata, isBaseUrl } from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import {
  Box,
  buttonClasses,
  Container,
  Fade,
  styled,
  Typography,
} from "@mui/material";
import { useRouter } from "next/router";
import { NextSeo } from "next-seo";
import { FunctionComponent, useCallback, useMemo } from "react";

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
import { getLayoutWithSidebar, NextPageWithLayout } from "../shared/layout";
import { Button } from "../shared/ui";
import { TabLink } from "../shared/ui/tab-link";
import { Tabs } from "../shared/ui/tabs";
import { EntitiesTable } from "./shared/entities-table";
import { TopContextBar } from "./shared/top-context-bar";
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

  return isViewAllPagesPage ||
    isViewAllDocumentsPage ||
    isViewAllCanvasesPage ? (
    <Box display="flex" gap={3}>
      {isViewAllPagesPage || isViewAllDocumentsPage ? (
        <CreateButton
          variant="tertiary_quiet"
          endIcon={<FileCirclePlusRegularIcon />}
          onClick={createDocument}
        >
          Create new document
        </CreateButton>
      ) : null}
      {isViewAllPagesPage || isViewAllCanvasesPage ? (
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
      entityTypeId ?? entityTypeBaseUrl
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

  const isViewAllPagesPage =
    entityType && entityType.schema.$id === systemEntityTypes.page.entityTypeId;

  const pageTitle = entityType
    ? entityTypeId
      ? `${entityType.schema.title} v${extractVersion(entityTypeId)}`
      : pluralize(entityType.schema.title)
    : "Entities";

  const { entities, loading } = entityTypeEntitiesValue;

  const displayCreateEntityButton = useMemo(() => {
    if (isViewAllPagesPage) {
      return hashInstance?.properties.pagesAreEnabled;
    }

    return true;
  }, [isViewAllPagesPage, hashInstance]);

  return (
    <>
      <NextSeo title={pageTitle} />
      <TopContextBar
        defaultCrumbIcon={null}
        crumbs={[
          {
            title: pageTitle,
            href: isViewAllPagesPage
              ? "/pages"
              : `/entities${
                  entityTypeId ? `?entityTypeIdOrBaseUrl=${entityTypeId}` : ""
                }`,
            id: entityTypeId ?? "entities",
            icon: isViewAllPagesPage ? (
              <FilesRegularIcon />
            ) : (
              <AsteriskRegularIcon />
            ),
          },
        ]}
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
              {isViewAllPagesPage ? <FilesLightIcon /> : <AsteriskLightIcon />}
            </Box>
            {pageTitle}
          </Typography>
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
