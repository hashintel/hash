import type {
  EntityTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import {
  extractBaseUrl,
  extractVersion,
  isBaseUrl,
} from "@blockprotocol/type-system";
import {
  AsteriskRegularIcon,
  EntityOrTypeIcon,
  EyeSolidIcon,
  PenToSquareSolidIcon,
} from "@hashintel/design-system";
import {
  blockProtocolEntityTypes,
  systemEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { pluralize } from "@local/hash-isomorphic-utils/pluralize";
import type { SxProps, Theme } from "@mui/material";
import {
  Box,
  buttonClasses,
  Container,
  Fade,
  Stack,
  Typography,
} from "@mui/material";
import { useRouter } from "next/router";
import { NextSeo } from "next-seo";
import type { FunctionComponent } from "react";
import { useCallback, useMemo } from "react";

import { useAccountPages } from "../components/hooks/use-account-pages";
import { useCreatePage } from "../components/hooks/use-create-page";
import { useHashInstance } from "../components/hooks/use-hash-instance";
import { useLatestEntityTypesOptional } from "../shared/entity-types-context/hooks";
import { useEntityTypesContextRequired } from "../shared/entity-types-context/hooks/use-entity-types-context-required";
import { generateLinkParameters } from "../shared/generate-link-parameters";
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
import { CreateButton } from "./shared/create-button";
import { EntitiesVisualizer } from "./shared/entities-visualizer";
import { TopContextBar } from "./shared/top-context-bar";
import { useEnabledFeatureFlags } from "./shared/use-enabled-feature-flags";
import { useActiveWorkspace } from "./shared/workspace-context";

const contentMaxWidth = 1000;

type ParsedQueryParams = {
  entityTypeIdOrBaseUrl?: string;
};

export const CreateButtons: FunctionComponent<{
  entityType?: EntityTypeWithMetadata;
}> = ({ entityType }) => {
  const router = useRouter();
  const { activeWorkspaceWebId, activeWorkspace } = useActiveWorkspace();

  const { isSpecialEntityTypeLookup } = useEntityTypesContextRequired();

  const { lastRootPageIndex } = useAccountPages(activeWorkspaceWebId);
  const [createUntitledPage] = useCreatePage({
    shortname: activeWorkspace?.shortname,
    webId: activeWorkspaceWebId,
  });

  const { isFile, isLink } = useMemo(
    () =>
      entityType
        ? (isSpecialEntityTypeLookup?.[entityType.schema.$id] ?? {
            isFile: false,
            isLink:
              entityType.schema.$id ===
              blockProtocolEntityTypes.link.entityTypeId,
          })
        : { isFile: false, isLink: false },
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
      entityType && isFile
        ? `${generateLinkParameters(entityType.schema.$id).href}?tab=upload`
        : `/new/entity${
            entityType
              ? `?entity-type-id=${encodeURIComponent(entityType.schema.$id)}`
              : ""
          }`,
    );
  }, [entityType, isFile, router]);

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

  if (isLink) {
    return null;
  }

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
      {isFile ? "Add" : "Create"} new{" "}
      {entityType?.schema.title.toLowerCase() ?? "entity"}
      {isFile ? "(s)" : ""}
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

  const { userPermissions, loading: userPermissionsLoading } =
    useUserPermissionsOnEntityType(entityType?.schema.$id);

  const isViewAllPagesPage =
    entityType && entityType.schema.$id === systemEntityTypes.page.entityTypeId;

  const pageTitle = entityType
    ? entityTypeId
      ? `${entityType.schema.title} v${extractVersion(entityTypeId).toString()}`
      : // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- we don't want an empty string
        entityType.schema.titlePlural || pluralize(entityType.schema.title)
    : "Entities";

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
          <EntityOrTypeIcon
            entity={null}
            fill={({ palette }) => palette.gray[50]}
            fontSize={14}
            icon={entityType.schema.icon}
            isLink={
              /**
               * @todo H-3363 use closed schema to take account of indirectly inherited link status
               */
              entityType.schema.$id ===
                blockProtocolEntityTypes.link.entityTypeId ||
              !!entityType.schema.allOf?.some(
                (allOf) =>
                  allOf.$ref === blockProtocolEntityTypes.link.entityTypeId,
              )
            }
          />
        ),
      });
    }

    return crumbs;
  }, [entityType, isViewAllPagesPage, pageTitle]);

  const maxWidth = { lg: `max(${contentMaxWidth}, "70%")` } as const;

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
        <Container sx={{ maxWidth }}>
          <Stack direction="row" justifyContent="space-between">
            <Stack direction="row" alignItems="center" gap={2} my={3}>
              {isViewAllPagesPage ? (
                <FilesLightIcon />
              ) : (
                <EntityOrTypeIcon
                  entity={null}
                  fill={({ palette }) => palette.gray[70]}
                  fontSize={40}
                  icon={entityType?.schema.icon}
                  isLink={
                    /**
                     * @todo H-3363 use closed schema to take account of indirectly inherited link status
                     */
                    entityType?.schema.$id ===
                      blockProtocolEntityTypes.link.entityTypeId ||
                    !!entityType?.schema.allOf?.some(
                      (allOf) =>
                        allOf.$ref ===
                        blockProtocolEntityTypes.link.entityTypeId,
                    )
                  }
                />
              )}
              <Typography variant="h1" fontWeight="bold" my={3}>
                {pageTitle}
              </Typography>
            </Stack>
            {entityType && (
              <Button
                href={generateLinkParameters(entityType.schema.$id).href}
                size="small"
                sx={{ alignSelf: "center" }}
              >
                {userPermissions?.edit ? "Edit" : "View"} Type
                {userPermissions?.edit ? (
                  <PenToSquareSolidIcon sx={typeIconSx} />
                ) : (
                  <EyeSolidIcon sx={typeIconSx} />
                )}
              </Button>
            )}
          </Stack>
          <Box display="flex" justifyContent="space-between">
            <Tabs value="all">
              <TabLink href="" value="all" active label={`All ${pageTitle}`} />
            </Tabs>
            <Fade in={displayCreateEntityButton}>
              <Box>
                <CreateButtons entityType={entityType} />
              </Box>
            </Fade>
          </Box>
        </Container>
      </Box>
      <Container sx={{ maxWidth, py: 5 }}>
        <EntitiesVisualizer
          entityTypeBaseUrl={entityTypeBaseUrl}
          entityTypeId={entityTypeId}
          hideColumns={entityTypeId ? ["entityTypes"] : []}
        />
      </Container>
    </>
  );
};

EntitiesPage.getLayout = (page) =>
  getLayoutWithSidebar(page, {
    fullWidth: true,
  });

export default EntitiesPage;
