import { useMutation, useQuery } from "@apollo/client";
import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type { EntityId, PropertyObject } from "@blockprotocol/type-system";
import { mustHaveAtLeastOne, splitEntityId } from "@blockprotocol/type-system";
import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import {
  deserializeQueryEntitySubgraphResponse,
  getClosedMultiEntityTypeFromMap,
  HashEntity,
  mergePropertyObjectAndMetadata,
  patchesFromPropertyObjects,
} from "@local/hash-graph-sdk/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolEntityTypes,
  blockProtocolPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useSnackbar } from "../../components/hooks/use-snackbar";
import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../graphql/api-types.gen";
import {
  queryEntitySubgraphQuery,
  updateEntityMutation,
} from "../../graphql/queries/knowledge/entity.queries";
import { EditBarEntityEditor } from "./entity/edit-bar";
import type { EntityEditorProps } from "./entity/entity-editor";
import { EntityEditor } from "./entity/entity-editor";
import { EntityEditorContainer } from "./entity/entity-editor-container";
import { EntityHeader } from "./entity/entity-header";
import { EntityPageLoadingState } from "./entity/entity-page-loading-state";
import { getEntityMultiTypeDependencies } from "./entity/get-entity-multi-type-dependencies";
import { QueryEditor } from "./entity/query-editor";
import { QueryEditorToggle } from "./entity/query-editor-toggle";
import { createDraftEntitySubgraph } from "./entity/shared/create-draft-entity-subgraph";
import { EntityEditorTabProvider } from "./entity/shared/entity-editor-tabs";
import { useApplyDraftLinkEntityChanges } from "./entity/shared/use-apply-draft-link-entity-changes";
import {
  type DraftLinksToCreate,
  useDraftLinkState,
} from "./entity/shared/use-draft-link-state";
import { useHandleTypeChanges } from "./entity/shared/use-handle-type-changes";
import { NotFound } from "./not-found";
import { useSlideStack } from "./slide-stack";
import { useGetClosedMultiEntityTypes } from "./use-get-closed-multi-entity-type";
import {
  type MinimalEntityValidationReport,
  useValidateEntity,
} from "./use-validate-entity";

interface EntityProps {
  entityId: EntityId;
  /**
   * The default outgoing link filters to apply to the links tables in the entity editor
   */
  defaultOutgoingLinkFilters?: EntityEditorProps["defaultOutgoingLinkFilters"];

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
    createFromLocalDraft: (params: {
      localDraft: HashEntity;
      draftLinksToCreate: DraftLinksToCreate;
    }) => Promise<void>;
    /**
     * The initial subgraph of the new draft entity.
     */
    initialSubgraph: Subgraph<EntityRootType<HashEntity>>;
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
  onEntityUpdatedInDb: (updatedEntity: HashEntity) => void | null;
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
  onRemoteDraftPublished: (publishedEntity: HashEntity) => void;
  /**
   * Optional callback to allow the parent to take some action based on the initial state of the entity,
   * useful for e.g. rerouting to another page if the entity is of a specific type,
   */
  onEntityLoad?: (entity: HashEntity) => void;
  /**
   * Optional callback to allow the parent to take some action when the entity's label changes,
   * e.g. if it's displaying it somewhere outside of this component (such as HTML <title>).
   */
  onEntityLabelChange?: (entityLabel: string) => void;

  /**
   * If the entity is a Flow proposal, it won't be persisted in the database yet.
   * This mock subgraph allows viewing it in the slide (and will disable attempting to request info from the db on it)
   */
  proposedEntitySubgraph?: Subgraph<EntityRootType<HashEntity>>;
}

export const Entity = ({
  defaultOutgoingLinkFilters,
  draftLocalEntity,
  entityId,
  isInSlide,
  onEntityUpdatedInDb,
  onRemoteDraftArchived,
  onRemoteDraftPublished,
  onEntityLoad,
  onEntityLabelChange,
  proposedEntitySubgraph,
}: EntityProps) => {
  const [shouldShowQueryEditor, setShouldShowQueryEditor] = useState(true);
  const { triggerSnackbar } = useSnackbar();

  const { pushToSlideStack } = useSlideStack();

  const [webId, entityUuid, draftId] = splitEntityId(entityId);

  const [dataFromDb, setDataFromDb] =
    useState<
      Pick<
        EntityEditorProps,
        | "closedMultiEntityType"
        | "closedMultiEntityTypesDefinitions"
        | "entitySubgraph"
        | "linkAndDestinationEntitiesClosedMultiEntityTypesMap"
      >
    >();

  const [draftEntitySubgraph, setDraftEntitySubgraph] = useState<
    Subgraph<EntityRootType<HashEntity>> | undefined
  >(draftLocalEntity?.initialSubgraph ?? proposedEntitySubgraph);

  const [draftEntityTypesDetails, setDraftEntityTypesDetails] = useState<
    | Pick<
        EntityEditorProps,
        | "closedMultiEntityType"
        | "closedMultiEntityTypesDefinitions"
        | "linkAndDestinationEntitiesClosedMultiEntityTypesMap"
      >
    | undefined
  >();

  const [
    draftLinksToCreate,
    setDraftLinksToCreate,
    draftLinksToArchive,
    setDraftLinksToArchive,
  ] = useDraftLinkState();

  const { getClosedMultiEntityTypes } = useGetClosedMultiEntityTypes();

  useEffect(() => {
    if (
      (draftLocalEntity || proposedEntitySubgraph) &&
      !draftEntityTypesDetails
    ) {
      let entityTypeIds: VersionedUrl[] | undefined;

      if (draftLocalEntity) {
        entityTypeIds = [draftLocalEntity.entityTypeId];
      } else if (proposedEntitySubgraph) {
        const proposedEntity = getRoots(proposedEntitySubgraph)[0];

        if (!proposedEntity) {
          throw new Error("No entity found in proposedEntitySubgraph");
        }

        entityTypeIds = proposedEntity.metadata.entityTypeIds;
      }

      if (!entityTypeIds) {
        throw new Error("No entity type ids found");
      }

      const allRequiredMultiTypeIds = getEntityMultiTypeDependencies({
        entityId,
        entityTypeIds,
        entitySubgraph: proposedEntitySubgraph ?? null,
      });

      void getClosedMultiEntityTypes(allRequiredMultiTypeIds).then((result) => {
        const closedMultiEntityType = getClosedMultiEntityTypeFromMap(
          result.closedMultiEntityTypes,
          mustHaveAtLeastOne(entityTypeIds),
        );

        setDraftEntityTypesDetails({
          linkAndDestinationEntitiesClosedMultiEntityTypesMap:
            result.closedMultiEntityTypes,
          closedMultiEntityType,
          closedMultiEntityTypesDefinitions:
            result.closedMultiEntityTypesDefinitions,
        });
      });
    }
  }, [
    draftLocalEntity,
    draftEntityTypesDetails,
    draftLinksToCreate,
    entityId,
    getClosedMultiEntityTypes,
    proposedEntitySubgraph,
  ]);

  const [loading, setLoading] = useState(
    !proposedEntitySubgraph && !draftLocalEntity,
  );

  const [isDirty, setIsDirty] = useState(!!draftLocalEntity);

  const { data: queryEntitySubgraphData, refetch } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    fetchPolicy: "cache-and-network",
    onCompleted: (data) => {
      const subgraph = deserializeQueryEntitySubgraphResponse(
        data.queryEntitySubgraph,
      ).subgraph;

      const { definitions, closedMultiEntityTypes } = data.queryEntitySubgraph;

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
        linkAndDestinationEntitiesClosedMultiEntityTypesMap:
          closedMultiEntityTypes,
        closedMultiEntityType,
        closedMultiEntityTypesDefinitions: definitions,
      });

      setDataFromDb({
        entitySubgraph: subgraph,
        closedMultiEntityType,
        closedMultiEntityTypesDefinitions: definitions,
        linkAndDestinationEntitiesClosedMultiEntityTypesMap:
          closedMultiEntityTypes,
      });

      setDraftEntitySubgraph(subgraph);

      setIsDirty(false);
      setDraftLinksToCreate([]);
      setDraftLinksToArchive([]);

      setLoading(false);
    },
    variables: {
      request: {
        filter: {
          all: [
            {
              equal: [{ path: ["uuid"] }, { parameter: entityUuid }],
            },
            {
              equal: [{ path: ["webId"] }, { parameter: webId }],
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
        includePermissions: true,
      },
    },
    skip: !!draftLocalEntity || !!proposedEntitySubgraph,
  });

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const applyDraftLinkEntityChanges = useApplyDraftLinkEntityChanges();

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

  const isReadOnly =
    /**
     * @todo H-3398 fix Glide grid editor overlays when body isn't fullscreened.
     *       Editing popups won't work until this is fixed, so we set the editor to readonly in fullscreen mode.
     */
    !!document.fullscreenElement ||
    !!draftEntity?.metadata.archived ||
    !!proposedEntitySubgraph ||
    (!draftLocalEntity &&
      !!queryEntitySubgraphData?.queryEntitySubgraph.entityPermissions?.update[
        entityId
      ]);

  const entityFromDb = useMemo(
    () => (dataFromDb ? getRoots(dataFromDb.entitySubgraph)[0] : null),
    [dataFromDb],
  );

  const resetDraftState = () => {
    setIsDirty(false);
    setDraftLinksToCreate([]);
    setDraftLinksToArchive([]);

    if (dataFromDb) {
      setDraftEntitySubgraph(dataFromDb.entitySubgraph);
      setDraftEntityTypesDetails({
        linkAndDestinationEntitiesClosedMultiEntityTypesMap:
          dataFromDb.linkAndDestinationEntitiesClosedMultiEntityTypesMap,
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

  const [validationReport, setValidationReport] =
    useState<MinimalEntityValidationReport | null>(null);

  const { validateEntity: validateFn } = useValidateEntity();

  const validateEntity = useCallback(
    async (entityToValidate: HashEntity) => {
      const report = await validateFn({
        properties: entityToValidate.propertiesWithMetadata,
        entityTypeIds: entityToValidate.metadata.entityTypeIds,
      });

      setValidationReport(report);
    },
    [validateFn],
  );

  const handleSaveChanges = async (overrideProperties?: PropertyObject) => {
    if (!draftEntitySubgraph || !draftEntity) {
      throw new Error(
        "Draft subgraph and entity must be present to save entity",
      );
    }

    if (draftLocalEntity) {
      try {
        setSavingChanges(true);

        const report = await validateFn({
          properties: draftEntity.propertiesWithMetadata,
          entityTypeIds: draftEntity.metadata.entityTypeIds,
        });

        if (report) {
          setValidationReport(report);
          return;
        }

        await draftLocalEntity.createFromLocalDraft({
          localDraft: draftEntity,
          draftLinksToCreate,
        });
      } finally {
        setSavingChanges(false);
      }
      return;
    }

    if (!dataFromDb) {
      throw new Error("No data from database");
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

        return new HashEntity(result.data.updateEntity);
      });

      await refetch();

      onEntityUpdatedInDb(updatedEntity);
    } finally {
      setSavingChanges(false);
    }
  };

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

  if (
    loading ||
    !draftEntityTypesDetails ||
    !draftEntitySubgraph ||
    !entityLabel
  ) {
    return <EntityPageLoadingState />;
  }

  if (!draftEntity) {
    return (
      <NotFound resourceLabel={{ label: "entity", withArticle: "an entity" }} />
    );
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
          isInSlide={isInSlide}
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
          readonly={isReadOnly}
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

            setIsDirty(
              JSON.stringify(changedEntity.properties) !==
                JSON.stringify(entityFromDb?.properties),
            );
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
              <EditBarEntityEditor
                visible={haveChangesBeenMade || !!draftLocalEntity}
                {...(draftLocalEntity
                  ? {
                      discardButtonProps: {
                        onClick: draftLocalEntity.onDraftDiscarded,
                        children: "Discard entity",
                      },
                      confirmButtonProps: {
                        onClick: () => handleSaveChanges(),
                        loading: savingChanges,
                        children: "Create entity",
                      },
                      label: "– this entity has not been created yet",
                    }
                  : {
                      confirmButtonProps: {
                        onClick: () => handleSaveChanges(),
                        loading: savingChanges,
                        children: "Save changes",
                      },
                      discardButtonProps: {
                        onClick: discardChanges,
                        children: "Discard changes",
                      },
                    })}
                hasErrors={!!validationReport}
              />
            }
            entity={draftEntity}
            entityLabel={entityLabel}
            entitySubgraph={draftEntitySubgraph}
            hideOpenInNew={!!proposedEntitySubgraph || !!draftLocalEntity}
            isInSlide={isInSlide}
            isLocalDraft={!!draftLocalEntity}
            isModifyingEntity={haveChangesBeenMade}
            onDraftArchived={onRemoteDraftArchived}
            onDraftPublished={onRemoteDraftPublished}
            onUnarchived={() => {
              void refetch();
            }}
            showTabs={!draftLocalEntity}
          />
          <EntityEditorContainer isInSlide={isInSlide}>
            <EntityEditor
              defaultOutgoingLinkFilters={defaultOutgoingLinkFilters}
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
              readonly={isReadOnly}
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

                setIsDirty(
                  JSON.stringify(changedEntity.properties) !==
                    JSON.stringify(entityFromDb?.properties),
                );
              }}
              validationReport={validationReport}
            />
          </EntityEditorContainer>
        </>
      )}
    </EntityEditorTabProvider>
  );
};
