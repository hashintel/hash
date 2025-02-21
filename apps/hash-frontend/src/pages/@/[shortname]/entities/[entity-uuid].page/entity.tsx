import { useMutation, useQuery } from "@apollo/client";
import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import {
  Entity as EntityClass,
  getClosedMultiEntityTypeFromMap,
  mergePropertyObjectAndMetadata,
  patchesFromPropertyObjects,
} from "@local/hash-graph-sdk/entity";
import type { EntityId, PropertyObject } from "@local/hash-graph-types/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import {
  currentTimeInstantTemporalAxes,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolEntityTypes,
  blockProtocolPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { splitEntityId } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Box, Container } from "@mui/material";
import NextErrorComponent from "next/error";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useSnackbar } from "../../../../../components/hooks/use-snackbar";
import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../../../graphql/api-types.gen";
import {
  getEntitySubgraphQuery,
  updateEntityMutation,
} from "../../../../../graphql/queries/knowledge/entity.queries";
import { NotFound } from "../../../../shared/not-found";
import { inSlideContainerStyles } from "../../../../shared/shared/slide-styles";
import { useSlideStack } from "../../../../shared/slide-stack";
import { useGetClosedMultiEntityType } from "../../../../shared/use-get-closed-multi-entity-type";
import {
  type MinimalEntityValidationReport,
  useValidateEntity,
} from "../../../../shared/use-validate-entity";
import { EditBar } from "../../shared/edit-bar";
import type { EntityEditorProps } from "./entity/entity-editor";
import { EntityEditor } from "./entity/entity-editor";
import { EntityHeader } from "./entity/entity-header";
import { QueryEditor } from "./entity/query-editor";
import { EntityPageLoadingState } from "./entity-page-loading-state";
import { QueryEditorToggle } from "./query-editor-toggle";
import { createDraftEntitySubgraph } from "./shared/create-draft-entity-subgraph";
import { EntityEditorTabProvider } from "./shared/entity-editor-tabs";
import { useApplyDraftLinkEntityChanges } from "./shared/use-apply-draft-link-entity-changes";
import { useDraftLinkState } from "./shared/use-draft-link-state";
import { useHandleTypeChanges } from "./shared/use-handle-type-changes";

interface EntityProps {
  entityId: EntityId;

  /**
   * To be provided if this is a new entity which hasn't yet been created in the database,
   * e.g. the component's parent is a 'new entity page'.
   */
  draftLocalEntity?: {
    /**
     * The starting entityTypeId of the new entity. Users may add to or change this.
     */
    entityTypeId: VersionedUrl;
    /**
     * The action to take when the user clicks 'create'.
     * The parent is responsible for actually creating the entity.
     * Nothing will happen otherwise – the button will appear to have taken no effect.
     * The parent should reroute to the appropriate page, slide etc, with the persisted entityId.
     */
    createFromLocalDraft: (persistedEntityId: EntityId) => void;
    /**
     * The initial subgraph of the new draft entity.
     */
    initialSubgraph: Subgraph<EntityRootType>;
    /**
     * The action to take when the user clicks 'discard'.
     * The parent is responsible for rerouting the user to the appropriate page.
     * Nothing will happen otherwise – user will remain looking at a form.
     */
    onDraftDiscarded?: () => void;
  };
  /**
   * Whether this component is being loaded inside a slide.
   * This affects certain behavior, e.g.:
   * 1. selected tab will be set in and derived from the URL if outside a slide, but just be in-memory if inside a slide
   * 2. A slide will have an 'open in new' link to open the entity's page (it won't outside a slide, because we're already on it)
   */
  isInSlide: boolean;
  /**
   * Callback allowing the parent to take some action when an entity update is persisted to the database.
   * The form will reflect the changes, so parents need not do anything if the user is supposed to remain on the form.
   */
  onEntityUpdatedInDb: (updatedEntity: EntityClass) => void | null;
  /**
   * Callback for when a remote draft is archived (i.e. rejected).
   * The parent should take some action to reroute the user to another page or component.
   * If the parent is SURE the entity is not a draft in the db, this can throw an error.
   * e.g. if creating a new entity, it cannot be a draft in the db.
   */
  onRemoteDraftArchived: () => void;
  /**
   * Callback for when a remote draft is published (i.e. accepted).
   * The parent should take some action to reroute the user to the non-draft entity.
   * If the parent is SURE the entity is not a draft in the db, this can throw an error.
   * e.g. if creating a new entity, it cannot be a draft in the db.
   */
  onRemoteDraftPublished: (publishedEntity: EntityClass) => void;
  /**
   * Optional callback to allow the parent to take some action based on the initial state of the entity,
   * useful for e.g. rerouting to another page if the entity is of a specific type,
   */
  onEntityLoad?: (entity: EntityClass) => void;
  /**
   * Optional callback to allow the parent to take some action when the entity's label changes,
   * e.g. if it's displaying it somewhere outside of this component (such as HTML <title>).
   */
  onEntityLabelChange?: (entityLabel: string) => void;
}

export const Entity = ({
  draftLocalEntity,
  entityId,
  isInSlide,
  onEntityUpdatedInDb,
  onRemoteDraftArchived,
  onRemoteDraftPublished,
  onEntityLoad,
  onEntityLabelChange,
}: EntityProps) => {
  const [shouldShowQueryEditor, setShouldShowQueryEditor] = useState(true);
  const { triggerSnackbar } = useSnackbar();

  const { pushToSlideStack } = useSlideStack();

  const [ownedById, entityUuid, draftId] = splitEntityId(entityId);

  const [dataFromDb, setDataFromDb] =
    useState<
      Pick<
        EntityEditorProps,
        | "closedMultiEntityType"
        | "closedMultiEntityTypesDefinitions"
        | "closedMultiEntityTypesMap"
        | "entitySubgraph"
      >
    >();

  const [draftEntitySubgraph, setDraftEntitySubgraph] = useState<
    Subgraph<EntityRootType> | undefined
  >(draftLocalEntity?.initialSubgraph);

  const [draftEntityTypesDetails, setDraftEntityTypesDetails] = useState<
    | Pick<
        EntityEditorProps,
        "closedMultiEntityType" | "closedMultiEntityTypesDefinitions"
      >
    | undefined
  >();

  const { getClosedMultiEntityType } = useGetClosedMultiEntityType();

  useEffect(() => {
    if (draftLocalEntity && !draftEntityTypesDetails) {
      void getClosedMultiEntityType([draftLocalEntity.entityTypeId]).then(
        (result) => {
          setDraftEntityTypesDetails(result);
        },
      );
    }
  }, [draftLocalEntity, draftEntityTypesDetails, getClosedMultiEntityType]);

  const {
    data: getEntitySubgraphData,
    loading,
    refetch,
  } = useQuery<GetEntitySubgraphQuery, GetEntitySubgraphQueryVariables>(
    getEntitySubgraphQuery,
    {
      fetchPolicy: "cache-and-network",
      onCompleted: (data) => {
        const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
          data.getEntitySubgraph.subgraph,
        );

        const { definitions, closedMultiEntityTypes } = data.getEntitySubgraph;

        if (!definitions || !closedMultiEntityTypes) {
          throw new Error(
            "definitions and closedMultiEntityTypes must be present in entitySubgraph",
          );
        }

        const returnedEntity = getRoots(subgraph)[0];

        if (!returnedEntity) {
          throw new Error("No entity found in entitySubgraph");
        }

        onEntityLoad?.(returnedEntity);

        const closedMultiEntityType = getClosedMultiEntityTypeFromMap(
          closedMultiEntityTypes,
          returnedEntity.metadata.entityTypeIds,
        );

        setDraftEntityTypesDetails({
          closedMultiEntityType,
          closedMultiEntityTypesDefinitions: definitions,
        });

        setDataFromDb({
          entitySubgraph: subgraph,
          closedMultiEntityType,
          closedMultiEntityTypesDefinitions: definitions,
          closedMultiEntityTypesMap: closedMultiEntityTypes,
        });

        setDraftEntitySubgraph(subgraph);
      },
      variables: {
        request: {
          filter: {
            all: [
              {
                equal: [{ path: ["uuid"] }, { parameter: entityUuid }],
              },
              {
                equal: [{ path: ["ownedById"] }, { parameter: ownedById }],
              },
              ...(draftId
                ? [
                    {
                      equal: [{ path: ["draftId"] }, { parameter: draftId }],
                    },
                  ]
                : []),
            ],
          },
          temporalAxes: currentTimeInstantTemporalAxes,
          graphResolveDepths: {
            ...zeroedGraphResolveDepths,
            hasLeftEntity: { incoming: 1, outgoing: 1 },
            hasRightEntity: { incoming: 1, outgoing: 1 },
          },
          includeDrafts: !!draftId,
          includeEntityTypes: "resolvedWithDataTypeChildren",
        },
        includePermissions: false,
      },
    },
  );

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const isReadonly =
    !getEntitySubgraphData?.getEntitySubgraph.userPermissionsOnEntities?.[
      entityId
    ]?.edit;

  const applyDraftLinkEntityChanges = useApplyDraftLinkEntityChanges();

  const [
    draftLinksToCreate,
    setDraftLinksToCreate,
    draftLinksToArchive,
    setDraftLinksToArchive,
  ] = useDraftLinkState();

  const handleTypeChanges = useHandleTypeChanges({
    entitySubgraph: draftEntitySubgraph,
    setDraftEntityTypesDetails,
    setDraftEntitySubgraph,
    setDraftLinksToArchive,
  });

  const draftEntity = useMemo(
    () => (draftEntitySubgraph ? getRoots(draftEntitySubgraph)[0] : null),
    [draftEntitySubgraph],
  );

  const entityFromDb = useMemo(
    () => (dataFromDb ? getRoots(dataFromDb.entitySubgraph)[0] : null),
    [dataFromDb],
  );

  const [isDirty, setIsDirty] = useState(false);

  const resetDraftState = () => {
    setIsDirty(false);
    setDraftLinksToCreate([]);
    setDraftLinksToArchive([]);

    if (dataFromDb) {
      setDraftEntitySubgraph(dataFromDb.entitySubgraph);
      setDraftEntityTypesDetails({
        closedMultiEntityType: dataFromDb.closedMultiEntityType,
        closedMultiEntityTypesDefinitions:
          dataFromDb.closedMultiEntityTypesDefinitions,
      });
    }
  };

  const discardChanges = () => {
    resetDraftState();
    draftLocalEntity?.onDraftDiscarded?.();
  };

  const [savingChanges, setSavingChanges] = useState(false);

  const handleSaveChanges = async (overrideProperties?: PropertyObject) => {
    if (!dataFromDb || !draftEntitySubgraph) {
      return;
    }

    if (!draftEntity) {
      return;
    }

    try {
      setSavingChanges(true);

      const originalEntity = getRoots(dataFromDb.entitySubgraph)[0];
      if (!originalEntity) {
        throw new Error(`entity not found in subgraph`);
      }

      await applyDraftLinkEntityChanges(
        originalEntity,
        draftLinksToCreate,
        draftLinksToArchive,
      );

      const updatedEntity = await updateEntity({
        variables: {
          entityUpdate: {
            entityId: draftEntity.metadata.recordId.entityId,
            entityTypeIds: draftEntity.metadata.entityTypeIds,
            propertyPatches: patchesFromPropertyObjects({
              oldProperties: originalEntity.properties,
              newProperties: mergePropertyObjectAndMetadata(
                overrideProperties ?? draftEntity.properties,
                draftEntity.metadata.properties,
              ),
            }),
          },
        },
      }).then((result) => {
        if (!result.data?.updateEntity) {
          throw new Error("Failed to update entity");
        }

        return new EntityClass(result.data.updateEntity);
      });

      await refetch();

      onEntityUpdatedInDb(updatedEntity);
    } finally {
      setSavingChanges(false);
    }

    resetDraftState();
  };

  const [validationReport, setValidationReport] =
    useState<MinimalEntityValidationReport | null>(null);

  const { validateEntity: validateFn } = useValidateEntity();

  const validateEntity = useCallback(
    async (entityToValidate: EntityClass) => {
      const report = await validateFn({
        properties: entityToValidate.propertiesWithMetadata,
        entityTypeIds: entityToValidate.metadata.entityTypeIds,
      });

      setValidationReport(report);
    },
    [validateFn],
  );

  const entityLabel =
    draftEntity && draftEntityTypesDetails
      ? generateEntityLabel(
          draftEntityTypesDetails.closedMultiEntityType,
          draftEntity,
        )
      : null;

  useEffect(() => {
    if (entityLabel) {
      onEntityLabelChange?.(entityLabel);
    }
  }, [entityLabel, onEntityLabelChange]);

  if (loading) {
    return <EntityPageLoadingState />;
  }

  if (!draftEntity) {
    return (
      <NotFound resourceLabel={{ label: "entity", withArticle: "an entity" }} />
    );
  }

  if (!draftEntityTypesDetails || !draftEntitySubgraph || !entityLabel) {
    return <NextErrorComponent statusCode={404} />;
  }

  const haveChangesBeenMade =
    isDirty || !!draftLinksToCreate.length || !!draftLinksToArchive.length;

  const isQueryEntity = draftEntity.metadata.entityTypeIds.includes(
    blockProtocolEntityTypes.query.entityTypeId,
  );

  return (
    <EntityEditorTabProvider isInSlide={isInSlide}>
      {isQueryEntity && (
        <QueryEditorToggle
          shouldShowQueryEditor={shouldShowQueryEditor}
          toggle={() => setShouldShowQueryEditor((val) => !val)}
        />
      )}
      {isQueryEntity && shouldShowQueryEditor ? (
        <QueryEditor
          closedMultiEntityTypesMap={
            dataFromDb?.closedMultiEntityTypesMap ?? null
          }
          {...draftEntityTypesDetails}
          draftLinksToCreate={draftLinksToCreate}
          draftLinksToArchive={draftLinksToArchive}
          entityLabel={entityLabel}
          entitySubgraph={draftEntitySubgraph}
          handleTypesChange={async (change) => {
            const newEntity = await handleTypeChanges(change);

            await validateEntity(newEntity);

            setIsDirty(
              JSON.stringify(change.entityTypeIds.toSorted()) !==
                JSON.stringify(entityFromDb?.metadata.entityTypeIds.toSorted()),
            );
          }}
          isDirty={isDirty}
          onEntityClick={(clickedEntityId) =>
            pushToSlideStack({
              kind: "entity",
              itemId: clickedEntityId,
            })
          }
          onEntityUpdated={onEntityUpdatedInDb}
          onTypeClick={(type, versionedUrl) => {
            pushToSlideStack({
              kind: type,
              itemId: versionedUrl,
            });
          }}
          readonly={isReadonly}
          setDraftLinksToArchive={setDraftLinksToArchive}
          setDraftLinksToCreate={setDraftLinksToCreate}
          setEntity={async (changedEntity) => {
            setDraftEntitySubgraph((prev) =>
              createDraftEntitySubgraph({
                entity: changedEntity,
                entityTypeIds: changedEntity.metadata.entityTypeIds,
                currentSubgraph: prev,
                omitProperties: [],
              }),
            );

            await validateEntity(changedEntity);

            setIsDirty(true);
          }}
          validationReport={validationReport}
          mode={
            draftLocalEntity
              ? {
                  type: "create",
                  onDraftDiscarded: draftLocalEntity.onDraftDiscarded,
                }
              : { type: "edit" }
          }
          handleSaveQuery={async (value) => {
            const properties = {
              [blockProtocolPropertyTypes.query.propertyTypeBaseUrl]: value,
            };

            await handleSaveChanges(properties);

            if (!draftLocalEntity) {
              triggerSnackbar.success("Changes saved successfully");
            }
          }}
        />
      ) : (
        <>
          <EntityHeader
            closedMultiEntityType={
              draftEntityTypesDetails.closedMultiEntityType
            }
            editBar={
              <EditBar
                visible={haveChangesBeenMade}
                discardButtonProps={{
                  onClick: discardChanges,
                }}
                confirmButtonProps={{
                  onClick: () => handleSaveChanges(),
                  loading: savingChanges,
                  children: "Save changes",
                }}
                hasErrors={!!validationReport}
              />
            }
            entity={draftEntity}
            entityLabel={entityLabel}
            entitySubgraph={draftEntitySubgraph}
            isInSlide={isInSlide}
            isModifyingEntity={haveChangesBeenMade}
            onDraftArchived={onRemoteDraftArchived}
            onDraftPublished={onRemoteDraftPublished}
            showTabs
          />
          <Box
            sx={({ palette }) => ({
              borderTop: 1,
              borderColor: palette.gray[20],
              bgcolor: palette.gray[10],
            })}
          >
            <Container
              sx={{ py: 7, ...(isInSlide ? inSlideContainerStyles : {}) }}
            >
              <EntityEditor
                closedMultiEntityTypesMap={
                  dataFromDb?.closedMultiEntityTypesMap ?? null
                }
                {...draftEntityTypesDetails}
                draftLinksToCreate={draftLinksToCreate}
                draftLinksToArchive={draftLinksToArchive}
                entityLabel={entityLabel}
                entitySubgraph={draftEntitySubgraph}
                handleTypesChange={async (change) => {
                  const newEntity = await handleTypeChanges(change);

                  await validateEntity(newEntity);

                  setIsDirty(
                    JSON.stringify(change.entityTypeIds.toSorted()) !==
                      JSON.stringify(
                        entityFromDb?.metadata.entityTypeIds.toSorted(),
                      ),
                  );
                }}
                isDirty={isDirty}
                onEntityClick={(clickedEntityId) =>
                  pushToSlideStack({
                    kind: "entity",
                    itemId: clickedEntityId,
                  })
                }
                onEntityUpdated={onEntityUpdatedInDb}
                onTypeClick={(type, versionedUrl) => {
                  pushToSlideStack({
                    kind: type,
                    itemId: versionedUrl,
                  });
                }}
                readonly={isReadonly}
                setDraftLinksToArchive={setDraftLinksToArchive}
                setDraftLinksToCreate={setDraftLinksToCreate}
                setEntity={async (changedEntity) => {
                  setDraftEntitySubgraph((prev) =>
                    createDraftEntitySubgraph({
                      entity: changedEntity,
                      entityTypeIds: changedEntity.metadata.entityTypeIds,
                      currentSubgraph: prev,
                      omitProperties: [],
                    }),
                  );

                  await validateEntity(changedEntity);

                  setIsDirty(true);
                }}
                validationReport={validationReport}
              />
            </Container>
          </Box>
        </>
      )}
    </EntityEditorTabProvider>
  );
};
