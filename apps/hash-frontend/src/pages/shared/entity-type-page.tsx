import type { EntityTypeWithMetadata } from "@blockprotocol/graph";
import {
  atLeastOne,
  extractVersion,
  mustHaveAtLeastOne,
} from "@blockprotocol/type-system";
import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import { EntityOrTypeIcon } from "@hashintel/design-system";
import type { EntityTypeEditorFormData } from "@hashintel/type-editor";
import {
  EntityTypeFormProvider,
  getEntityTypeFromFormData,
  getFormDataFromEntityType,
  useEntityTypeForm,
} from "@hashintel/type-editor";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
import { rewriteSchemasToNextVersion } from "@local/hash-isomorphic-utils/ontology-types";
import { linkEntityTypeUrl } from "@local/hash-subgraph";
import type { Theme } from "@mui/material";
import { Box, Container, Typography } from "@mui/material";
import { GlobalStyles } from "@mui/system";
import { useRouter } from "next/router";
import { NextSeo } from "next-seo";
import { useEffect, useMemo, useRef, useState } from "react";

import { useIsSpecialEntityType } from "../../shared/entity-types-context/hooks";
import { generateLinkParameters } from "../../shared/generate-link-parameters";
import { isTypeArchived } from "../../shared/is-archived";
import { isHrefExternal } from "../../shared/is-href-external";
import { useUserPermissionsOnEntityType } from "../../shared/use-user-permissions-on-entity-type";
import { ArchiveMenuItem } from "../@/[shortname]/shared/archive-menu-item";
import { ConvertTypeMenuItem } from "./entity-type-page/convert-type-menu-item";
import { DefinitionTab } from "./entity-type-page/definition-tab";
import { EditBarTypeEditor } from "./entity-type-page/edit-bar-type-editor";
import { EntitiesTab } from "./entity-type-page/entities-tab";
import { EntityTypeTabs } from "./entity-type-page/entity-type-tabs";
import { FileUploadsTab } from "./entity-type-page/file-uploads-tab";
import { EntityTypeContext } from "./entity-type-page/shared/entity-type-context";
import { EntityTypeHeader } from "./entity-type-page/shared/entity-type-header";
import { useCurrentTab } from "./entity-type-page/shared/tabs";
import { TypeSlideOverStack } from "./entity-type-page/type-slide-over-stack";
import { UpgradeDependentsModal } from "./entity-type-page/upgrade-dependents-modal";
import {
  type EntityTypeDependent,
  useGetEntityTypeDependents,
} from "./entity-type-page/use-entity-type-dependents";
import { useEntityTypeValue } from "./entity-type-page/use-entity-type-value";
import { NotFound } from "./not-found";
import {
  TypeDefinitionContainer,
  typeHeaderContainerStyles,
} from "./shared/type-editor-styling";
import { TopContextBar } from "./top-context-bar";

type EntityTypeProps = {
  ownedById?: OwnedById | null;
  draftEntityType?: EntityTypeWithMetadata | null;
  entityTypeBaseUrl?: BaseUrl;
  requestedVersion: number | null;
};

export const EntityTypePage = ({
  ownedById,
  draftEntityType,
  entityTypeBaseUrl,
  requestedVersion,
}: EntityTypeProps) => {
  const router = useRouter();

  const formMethods = useEntityTypeForm<EntityTypeEditorFormData>({
    defaultValues: { allOf: [], properties: [], links: [], inverse: {} },
  });
  const { handleSubmit: wrapHandleSubmit, reset, watch } = formMethods;

  useEffect(() => {
    if (draftEntityType) {
      reset(getFormDataFromEntityType(draftEntityType.schema));
    }
  }, [draftEntityType, reset]);

  const [
    remoteEntityType,
    latestVersion,
    remotePropertyTypes,
    updateEntityTypes,
    publishDraft,
    { loading: loadingRemoteEntityType },
  ] = useEntityTypeValue(
    entityTypeBaseUrl ?? null,
    requestedVersion,
    ownedById ?? null,
    (fetchedEntityType) => {
      // Load the initial form data after the entity type has been fetched
      reset({
        ...getFormDataFromEntityType(fetchedEntityType.schema),
      });
    },
  );

  const entityType = remoteEntityType ?? draftEntityType;

  const parentRefs = formMethods.watch("allOf");
  const { isLink, isFile, isImage } = useIsSpecialEntityType({
    allOf: atLeastOne(parentRefs.map((id) => ({ $ref: id }))),
    $id: entityType?.schema.$id,
  });

  const entityTypeAndPropertyTypes = useMemo(
    () =>
      entityType
        ? {
            entityType,
            propertyTypes: remotePropertyTypes ?? {},
          }
        : null,
    [entityType, remotePropertyTypes],
  );

  const isDirty = Object.keys(formMethods.formState.dirtyFields).length > 0;
  const isDraft = !!draftEntityType;

  const { userPermissions } = useUserPermissionsOnEntityType(
    entityType?.schema.$id,
  );

  const [entityTypeDependents, setEntityTypeDependents] = useState<
    Record<BaseUrl, EntityTypeDependent>
  >({});

  const [dependentsExcludedFromUpgrade, setDependentsExcludedFromUpgrade] =
    useState<BaseUrl[]>([]);

  const { upgradableDependencies, entityTypesToUpgrade } = useMemo(
    () => ({
      upgradableDependencies: Object.values(entityTypeDependents).filter(
        (dependent) =>
          dependent.noFurtherTraversalBecause !== "external-web" &&
          dependent.noFurtherTraversalBecause !== "external-type-host",
      ),
      entityTypesToUpgrade: Object.values(entityTypeDependents).filter(
        (dependent) => !dependent.noFurtherTraversalBecause,
      ),
    }),
    [entityTypeDependents],
  );

  const [showDependencyUpgradeModal, setShowDependencyUpgradeModal] =
    useState(false);

  const { getEntityTypeDependents, loading } = useGetEntityTypeDependents();

  useEffect(() => {
    if (!entityType) {
      return;
    }

    void getEntityTypeDependents({
      entityTypeId: entityType.schema.$id,
      excludeBaseUrls: dependentsExcludedFromUpgrade,
    }).then((dependents) => {
      setEntityTypeDependents(dependents);
    });
  }, [getEntityTypeDependents, entityType, dependentsExcludedFromUpgrade]);

  const handleSubmit = wrapHandleSubmit(async (data) => {
    if (!isDirty && !isDraft) {
      /**
       * Prevent publishing a type unless:
       * 1. The form has been touched by the user (isDirty) – don't publish versions without changes
       * OR
       * 2. It's a new draft type – the user may not have touched the form from its initial state,
       *    which is set from input the user supplies in a separate form/modal.
       */
      return;
    }

    const { schema: entityTypeSchema } = getEntityTypeFromFormData(data);

    if (draftEntityType) {
      await publishDraft({
        ...draftEntityType.schema,
        ...entityTypeSchema,
      });
      reset(data);
    } else {
      if (!remoteEntityType) {
        throw new Error(
          "Cannot update entity type without existing entityType schema",
        );
      }

      if (upgradableDependencies.length && !showDependencyUpgradeModal) {
        setShowDependencyUpgradeModal(true);
        return;
      }

      setShowDependencyUpgradeModal(false);

      const currentEntityTypeId = entityType?.schema.$id;
      if (!currentEntityTypeId) {
        throw new Error(
          "Cannot update entity type without existing entityType schema",
        );
      }

      /**
       * Rewrite schemas of the type and any types dependent on it that the user has choosen to upgrade,
       * so that they all refer to the latest versions (after the update has been applied).
       * Types may refer to each other, or reference themselves – via inheritance (allOf), as link types, or as link destinations
       */
      const [{ $id: _, ...rootType }, ...dependents] = mustHaveAtLeastOne(
        rewriteSchemasToNextVersion([
          {
            ...remoteEntityType.schema,
            ...entityTypeSchema,
          },
          ...entityTypesToUpgrade.map((dependent) => dependent.entityType),
        ]),
      );

      const res = await updateEntityTypes(rootType, dependents);

      if (!res.errors?.length && res.data?.updateEntityTypes[0]) {
        void router.push(
          generateLinkParameters(res.data.updateEntityTypes[0].schema.$id).href,
        );
      } else {
        throw new Error("Could not publish changes");
      }
    }
  });

  const currentTab = useCurrentTab();

  const [previewEntityTypeUrl, setPreviewEntityTypeUrl] =
    useState<VersionedUrl | null>(null);

  const titleWrapperRef = useRef<HTMLDivElement>(null);

  const onNavigateToType = (url: VersionedUrl) => {
    if (entityType && url === entityType.schema.$id) {
      titleWrapperRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      setPreviewEntityTypeUrl(url);
    }
  };

  if (!entityType) {
    if (loadingRemoteEntityType) {
      return null;
    } else if (isHrefExternal(entityTypeBaseUrl as string)) {
      return (
        <Container sx={{ mt: 8 }}>
          <Typography variant="h2" mb={4}>
            External type not found in database
          </Typography>
          <Typography mb={3}>
            This type wasn't created in this instance of HASH and isn't in use
            by any types or entities in it.
          </Typography>
        </Container>
      );
    } else {
      return (
        <NotFound
          resourceLabel={{
            label: "entity type",
            withArticle: "an entity type",
          }}
        />
      );
    }
  }

  if (!userPermissions) {
    return null;
  }

  const currentVersion = draftEntityType
    ? 0
    : extractVersion(entityType.schema.$id);

  const convertToLinkType = wrapHandleSubmit(async (data) => {
    if (upgradableDependencies.length && !showDependencyUpgradeModal) {
      setShowDependencyUpgradeModal(true);
      return;
    }

    if (!remoteEntityType) {
      throw new Error(
        "Cannot update entity type without existing entityType schema",
      );
    }

    setShowDependencyUpgradeModal(false);

    const { schema } = getEntityTypeFromFormData(data);

    /**
     * Rewrite schemas of the type and any types dependent on it that the user has choosen to upgrade,
     * so that they all refer to the latest versions (after the update has been applied).
     * Types may refer to each other, or reference themselves – via inheritance (allOf), as link types, or as link destinations
     */
    const [rootType, ...dependents] = mustHaveAtLeastOne(
      rewriteSchemasToNextVersion([
        {
          ...remoteEntityType.schema,
          ...schema,
        },
        ...entityTypesToUpgrade.map((dependent) => dependent.entityType),
      ]),
    );

    const res = await updateEntityTypes(
      {
        ...rootType,
        allOf: [{ $ref: linkEntityTypeUrl }, ...(rootType.allOf ?? [])],
      },
      dependents,
    );

    if (!res.errors?.length && res.data?.updateEntityTypes[0]) {
      void router.push(
        generateLinkParameters(res.data.updateEntityTypes[0].schema.$id).href,
      );
    } else {
      throw new Error("Could not publish changes");
    }
  });

  const icon = watch("icon");

  const isLatest = !requestedVersion || requestedVersion === latestVersion;

  const isReadonly = !draftEntityType && (!userPermissions.edit || !isLatest);

  return (
    <>
      <NextSeo title={`${entityType.schema.title} | Entity Type`} />
      <UpgradeDependentsModal
        dependents={entityTypeDependents}
        excludedDependencies={dependentsExcludedFromUpgrade}
        loading={loading}
        open={showDependencyUpgradeModal}
        onCancel={() => {
          setShowDependencyUpgradeModal(false);
        }}
        onConfirm={() => {
          void handleSubmit();
        }}
        setDependenciesToExclude={(excludedDependencies) => {
          setDependentsExcludedFromUpgrade(excludedDependencies);
        }}
        upgradingEntityType={entityType.schema}
      />
      <EntityTypeFormProvider {...formMethods}>
        <EntityTypeContext.Provider value={entityType.schema}>
          <Box display="contents" component="form" onSubmit={handleSubmit}>
            <TopContextBar
              actionMenuItems={[
                ...(remoteEntityType && !isTypeArchived(remoteEntityType)
                  ? [
                      <ArchiveMenuItem
                        key={entityType.schema.$id}
                        item={remoteEntityType}
                      />,
                    ]
                  : []),
                ...(!isReadonly && !isDraft && !isLink
                  ? [
                      <ConvertTypeMenuItem
                        key={entityType.schema.$id}
                        convertToLinkType={convertToLinkType}
                        disabled={isDirty}
                        typeTitle={entityType.schema.title}
                      />,
                    ]
                  : []),
              ]}
              defaultCrumbIcon={null}
              item={remoteEntityType ?? undefined}
              crumbs={[
                {
                  href: "/types",
                  title: "Types",
                  id: "types",
                },
                {
                  href: "/types/entity-type",
                  title: `${isLink ? "Link" : "Entity"} Types`,
                  id: "entity-types",
                },
                {
                  title: entityType.schema.title,
                  href: "#",
                  id: entityType.schema.$id,
                  icon: (
                    <EntityOrTypeIcon
                      entity={null}
                      fill={({ palette }) => palette.gray[50]}
                      fontSize={14}
                      icon={icon}
                      isLink={isLink}
                    />
                  ),
                },
              ]}
              scrollToTop={() => {}}
              sx={{ bgcolor: "white" }}
            />

            {!isReadonly && (
              <EditBarTypeEditor
                currentVersion={currentVersion}
                discardButtonProps={
                  // @todo confirmation of discard when draft
                  isDraft
                    ? {
                        href: `/new/types/entity-type`,
                      }
                    : {
                        onClick() {
                          reset();
                        },
                      }
                }
                key={entityType.schema.$id} // reset edit bar state when the entity type changes
              />
            )}

            <Box ref={titleWrapperRef} sx={typeHeaderContainerStyles}>
              <Container>
                <EntityTypeHeader
                  currentVersion={currentVersion}
                  entityTypeSchema={entityType.schema}
                  hideOpenInNew
                  isDraft={isDraft}
                  isLink={isLink}
                  isReadonly={isReadonly}
                  latestVersion={latestVersion}
                />

                <EntityTypeTabs
                  canCreateEntity={userPermissions.instantiate}
                  isDraft={isDraft}
                  isFile={isFile}
                  isImage={isImage}
                />
              </Container>
            </Box>

            <TypeDefinitionContainer>
              {currentTab === "definition" ? (
                entityTypeAndPropertyTypes ? (
                  <DefinitionTab
                    entityTypeAndPropertyTypes={entityTypeAndPropertyTypes}
                    onNavigateToType={onNavigateToType}
                    ownedById={ownedById ?? null}
                    readonly={isReadonly}
                  />
                ) : (
                  "Loading..."
                )
              ) : null}
              {currentTab === "entities" && entityTypeBaseUrl ? (
                <EntitiesTab entityTypeBaseUrl={entityTypeBaseUrl} />
              ) : null}
              {isFile && currentTab === "upload" ? (
                <FileUploadsTab isImage={isImage} />
              ) : null}
            </TypeDefinitionContainer>
          </Box>
        </EntityTypeContext.Provider>
      </EntityTypeFormProvider>

      {previewEntityTypeUrl ? (
        <TypeSlideOverStack
          rootTypeId={previewEntityTypeUrl}
          onClose={() => setPreviewEntityTypeUrl(null)}
        />
      ) : null}

      <GlobalStyles<Theme>
        styles={(theme) => ({
          body: {
            minHeight: "100vh",
            background: theme.palette.gray[10],
          },
        })}
      />
    </>
  );
};
