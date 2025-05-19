import type {
  BaseUrl,
  EntityTypeWithMetadata,
  OntologyTypeVersion,
  PropertyType,
  VersionedUrl,
  WebId,
} from "@blockprotocol/type-system";
import {
  atLeastOne,
  extractVersion,
  makeOntologyTypeVersion,
  mustHaveAtLeastOne,
} from "@blockprotocol/type-system";
import { EntityOrTypeIcon } from "@hashintel/design-system";
import type { EntityTypeEditorFormData } from "@hashintel/type-editor";
import {
  EntityTypeFormProvider,
  getEntityTypeFromFormData,
  getFormDataFromEntityType,
  useEntityTypeForm,
} from "@hashintel/type-editor";
import type { OntologyElementMetadata } from "@local/hash-graph-sdk/ontology";
import { blockProtocolEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { rewriteSchemasToNextVersion } from "@local/hash-isomorphic-utils/ontology-types";
import { Box, Container, Typography } from "@mui/material";
import { NextSeo } from "next-seo";
import { useEffect, useMemo, useRef, useState } from "react";

import { useIsSpecialEntityType } from "../../shared/entity-types-context/hooks";
import { isTypeArchived } from "../../shared/is-archived";
import { isHrefExternal } from "../../shared/is-href-external";
import { useUserPermissionsOnEntityType } from "../../shared/use-user-permissions-on-entity-type";
import { ArchiveMenuItem } from "../@/[shortname]/shared/archive-menu-item";
import { ConvertTypeMenuItem } from "./entity-type-page/convert-type-menu-item";
import { DefinitionTab } from "./entity-type-page/definition-tab";
import { EditBarTypeEditor } from "./entity-type-page/edit-bar-type-editor";
import { EntitiesTab } from "./entity-type-page/entities-tab";
import {
  EntityTypeTabProvider,
  EntityTypeTabs,
  useEntityTypeTab,
} from "./entity-type-page/entity-type-tabs";
import { FileUploadsTab } from "./entity-type-page/file-uploads-tab";
import { EntityTypeContext } from "./entity-type-page/shared/entity-type-context";
import { EntityTypeHeader } from "./entity-type-page/shared/entity-type-header";
import { UpgradeDependentsModal } from "./entity-type-page/upgrade-dependents-modal";
import {
  type EntityTypeDependent,
  useGetEntityTypeDependents,
} from "./entity-type-page/use-entity-type-dependents";
import { useEntityTypeValue } from "./entity-type-page/use-entity-type-value";
import { NotFound } from "./not-found";
import { inSlideContainerStyles } from "./shared/slide-styles";
import { TypeEditorSkeleton } from "./shared/type-editor-skeleton";
import {
  TypeDefinitionContainer,
  typeHeaderContainerStyles,
} from "./shared/type-editor-styling";
import { useSlideStack } from "./slide-stack";
import { TopContextBar } from "./top-context-bar";

type EntityTypeProps = {
  webId?: WebId | null;
  draftEntityType?: EntityTypeWithMetadata | null;
  entityTypeBaseUrl?: BaseUrl;
  isInSlide: boolean;
  onEntityTypeUpdated?: (entityType: EntityTypeWithMetadata) => void;
  requestedVersion: OntologyTypeVersion | null;
};

const TypeDefinition = ({
  entityTypeAndPropertyTypes,
  entityTypeBaseUrl,
  isFile,
  isImage,
  onNavigateToType,
  readonly,
}: {
  entityTypeAndPropertyTypes: {
    entityType: EntityTypeWithMetadata;
    propertyTypes: Record<
      `${string}v/${number}`,
      {
        schema: PropertyType;
        metadata: OntologyElementMetadata;
      }
    >;
  } | null;
  entityTypeBaseUrl: BaseUrl | null;
  isFile: boolean;
  isImage: boolean;
  onNavigateToType: (
    kind: "entityType" | "dataType",
    url: VersionedUrl,
  ) => void;
  readonly: boolean;
}) => {
  const { tab } = useEntityTypeTab();

  return (
    <>
      {tab === "definition" ? (
        entityTypeAndPropertyTypes ? (
          <DefinitionTab
            entityTypeAndPropertyTypes={entityTypeAndPropertyTypes}
            onNavigateToType={onNavigateToType}
            readonly={readonly}
          />
        ) : (
          "Loading..."
        )
      ) : null}
      {tab === "entities" && entityTypeBaseUrl ? (
        <EntitiesTab entityTypeBaseUrl={entityTypeBaseUrl} />
      ) : null}
      {isFile && tab === "upload" ? <FileUploadsTab isImage={isImage} /> : null}
    </>
  );
};

export const EntityType = ({
  webId,
  draftEntityType,
  entityTypeBaseUrl,
  isInSlide,
  requestedVersion,
  onEntityTypeUpdated,
}: EntityTypeProps) => {
  const { pushToSlideStack } = useSlideStack();

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
    { loading: loadingRemoteEntityType, refetch },
  ] = useEntityTypeValue(
    entityTypeBaseUrl ?? null,
    requestedVersion,
    webId ?? null,
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

  const { userPermissions, loading: loadingUserPermissions } =
    useUserPermissionsOnEntityType(
      isDraft ? undefined : entityType?.schema.$id,
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
        onEntityTypeUpdated?.(res.data.updateEntityTypes[0]);
      } else {
        throw new Error("Could not publish changes");
      }
    }
  });

  const titleWrapperRef = useRef<HTMLDivElement>(null);

  const onNavigateToType = (
    kind: "entityType" | "dataType",
    url: VersionedUrl,
  ) => {
    if (entityType && url === entityType.schema.$id) {
      titleWrapperRef.current?.scrollIntoView({ behavior: "smooth" });
    } else {
      pushToSlideStack({ kind, itemId: url });
    }
  };

  if (!entityType || (!userPermissions && !isDraft)) {
    if (loadingRemoteEntityType || loadingUserPermissions) {
      return <TypeEditorSkeleton />;
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

  const currentVersion = draftEntityType
    ? makeOntologyTypeVersion({ major: 0 })
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
        allOf: [
          { $ref: blockProtocolEntityTypes.link.entityTypeId },
          ...(rootType.allOf ?? []),
        ],
      },
      dependents,
    );

    if (!res.errors?.length && res.data?.updateEntityTypes[0]) {
      onEntityTypeUpdated?.(res.data.updateEntityTypes[0]);
    } else {
      throw new Error("Could not publish changes");
    }
  });

  const icon = watch("icon");

  const isLatest = !requestedVersion || requestedVersion === latestVersion;

  const isReadonly = !draftEntityType && (!userPermissions?.edit || !isLatest);

  const isArchived = isTypeArchived(entityType);

  return (
    <>
      {!isInSlide && (
        <NextSeo title={`${entityType.schema.title} | Entity Type`} />
      )}
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
          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={({ palette }) => ({
              background: palette.gray[10],
              width: "100%",
            })}
          >
            <TopContextBar
              actionMenuItems={[
                ...(!isReadonly && remoteEntityType && !isArchived
                  ? [
                      <ArchiveMenuItem
                        key={entityType.schema.$id}
                        item={remoteEntityType}
                        onItemChange={() => {
                          onEntityTypeUpdated?.(entityType);
                        }}
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
              onItemUnarchived={() => {
                void refetch();
              }}
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
                gentleErrorStyling={false}
                key={entityType.schema.$id} // reset edit bar state when the entity type changes
              />
            )}

            <EntityTypeTabProvider isInSlide={isInSlide}>
              <Box ref={titleWrapperRef} sx={typeHeaderContainerStyles}>
                <Container sx={isInSlide ? inSlideContainerStyles : {}}>
                  <EntityTypeHeader
                    currentVersion={currentVersion}
                    entityTypeSchema={entityType.schema}
                    isArchived={isArchived}
                    isDraft={isDraft}
                    isInSlide={isInSlide}
                    isLink={isLink}
                    isReadonly={isReadonly}
                    latestVersion={latestVersion}
                  />

                  <EntityTypeTabs
                    canCreateEntity={!!userPermissions?.instantiate}
                    isDraft={isDraft}
                    isFile={isFile}
                    isImage={isImage}
                    isInSlide={isInSlide}
                  />
                </Container>
              </Box>

              <TypeDefinitionContainer inSlide={isInSlide}>
                <TypeDefinition
                  entityTypeBaseUrl={entityTypeBaseUrl ?? null}
                  entityTypeAndPropertyTypes={entityTypeAndPropertyTypes}
                  isFile={isFile}
                  isImage={isImage}
                  onNavigateToType={onNavigateToType}
                  readonly={isReadonly}
                />
              </TypeDefinitionContainer>
            </EntityTypeTabProvider>
          </Box>
        </EntityTypeContext.Provider>
      </EntityTypeFormProvider>
    </>
  );
};
