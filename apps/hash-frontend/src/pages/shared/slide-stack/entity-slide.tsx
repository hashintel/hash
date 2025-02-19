import { useMutation, useQuery } from "@apollo/client";
import {
  ArrowUpRightFromSquareRegularIcon,
  ArrowUpRightRegularIcon,
  EntityOrTypeIcon,
  Skeleton,
} from "@hashintel/design-system";
import {
  type Entity,
  getClosedMultiEntityTypeFromMap,
  getDisplayFieldsForClosedEntityType,
  isClosedMultiEntityTypeForEntityTypeIds,
  mergePropertyObjectAndMetadata,
  patchesFromPropertyObjects,
} from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import type {
  ClosedMultiEntityTypesDefinitions,
  ClosedMultiEntityTypesRootMap,
} from "@local/hash-graph-types/ontology";
import { generateEntityPath } from "@local/hash-isomorphic-utils/frontend-paths";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import {
  currentTimeInstantTemporalAxes,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import {
  extractOwnedByIdFromEntityId,
  splitEntityId,
} from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Box, Stack, Typography } from "@mui/material";
import type { RefObject } from "react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";

import { useUserOrOrgShortnameByOwnedById } from "../../../components/hooks/use-user-or-org-shortname-by-owned-by-id";
import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../graphql/api-types.gen";
import {
  getEntitySubgraphQuery,
  updateEntityMutation,
} from "../../../graphql/queries/knowledge/entity.queries";
import { Button, Link } from "../../../shared/ui";
import type { EntityEditorProps } from "../../@/[shortname]/entities/[entity-uuid].page/entity-editor";
import { EntityEditor } from "../../@/[shortname]/entities/[entity-uuid].page/entity-editor";
import { createDraftEntitySubgraph } from "../../@/[shortname]/entities/[entity-uuid].page/shared/create-draft-entity-subgraph";
import { useApplyDraftLinkEntityChanges } from "../../@/[shortname]/entities/[entity-uuid].page/shared/use-apply-draft-link-entity-changes";
import { useDraftLinkState } from "../../@/[shortname]/entities/[entity-uuid].page/shared/use-draft-link-state";
import { useHandleTypeChanges } from "../../@/[shortname]/entities/[entity-uuid].page/shared/use-handle-type-changes";
import { ArchivedItemBanner } from "../top-context-bar/archived-item-banner";
import type { MinimalEntityValidationReport } from "../use-validate-entity";
import { useValidateEntity } from "../use-validate-entity";
import type { PushToStackFn } from "./types";

export interface EntitySlideProps {
  closedMultiEntityTypesMap?: ClosedMultiEntityTypesRootMap;
  closedMultiEntityTypesDefinitions?: ClosedMultiEntityTypesDefinitions;
  customColumns?: EntityEditorProps["customColumns"];
  defaultOutgoingLinkFilters?: EntityEditorProps["defaultOutgoingLinkFilters"];
  /**
   * Hide the link to open the entity in a new tab.
   */
  hideOpenInNew?: boolean;
  isReadOnly: boolean;
  onSubmit: () => void;
  pushToStack: PushToStackFn;
  /**
   * If you already have a subgraph with the entity, its types and incoming/outgoing links to a depth of 1, provide it.
   * If you have a subgraph with partial data (e.g. no links), you can provide it along with `entityId`,
   * and the missing data will be fetched and loaded in when it is available.
   */
  entitySubgraph?: Subgraph<EntityRootType>;
  entityId: EntityId;
  /**
   * The ref to the container of the slide. Used to correctly attach popups etc within the editor,
   * in case the slide is not attached to the body.
   */
  slideContainerRef?: RefObject<HTMLDivElement | null>;
}

export const EntitySlide = memo(
  ({
    closedMultiEntityTypesMap: providedClosedMultiEntityTypesMap,
    closedMultiEntityTypesDefinitions:
      providedClosedMultiEntityTypesDefinitions,
    customColumns,
    defaultOutgoingLinkFilters,
    entitySubgraph: providedEntitySubgraph,
    entityId: providedEntityId,
    hideOpenInNew,
    onSubmit,
    pushToStack,
    isReadOnly = false,
    slideContainerRef,
  }: EntitySlideProps) => {
    const [localEntitySubgraph, setLocalEntitySubgraph] = useState<
      Subgraph<EntityRootType> | undefined
    >(providedEntitySubgraph);

    const entity = localEntitySubgraph
      ? getRoots(localEntitySubgraph)[0]
      : null;

    const [ownedById, entityUuid, draftId] = splitEntityId(providedEntityId);

    const providedTypeDetails = useMemo(() => {
      if (
        providedClosedMultiEntityTypesMap &&
        providedClosedMultiEntityTypesDefinitions &&
        entity?.metadata.entityTypeIds
      ) {
        const closedMultiEntityType = getClosedMultiEntityTypeFromMap(
          providedClosedMultiEntityTypesMap,
          entity.metadata.entityTypeIds,
        );

        return {
          closedMultiEntityType,
          closedMultiEntityTypesDefinitions:
            providedClosedMultiEntityTypesDefinitions,
        };
      }
    }, [
      providedClosedMultiEntityTypesMap,
      providedClosedMultiEntityTypesDefinitions,
      entity?.metadata.entityTypeIds,
    ]);

    const [draftEntityTypesDetails, setDraftEntityTypesDetails] = useState<
      | Pick<
          EntityEditorProps,
          "closedMultiEntityType" | "closedMultiEntityTypesDefinitions"
        >
      | undefined
    >(providedTypeDetails);

    const [
      draftLinksToCreate,
      setDraftLinksToCreate,
      draftLinksToArchive,
      setDraftLinksToArchive,
    ] = useDraftLinkState();
    const applyDraftLinkEntityChanges = useApplyDraftLinkEntityChanges();

    const handleTypeChanges = useHandleTypeChanges({
      entitySubgraph: localEntitySubgraph,
      setDraftEntityTypesDetails,
      setDraftEntitySubgraph: setLocalEntitySubgraph,
      setDraftLinksToArchive,
    });

    useEffect(() => {
      if (
        entity?.metadata.entityTypeIds &&
        providedTypeDetails &&
        !isClosedMultiEntityTypeForEntityTypeIds(
          providedTypeDetails.closedMultiEntityType,
          entity.metadata.entityTypeIds,
        )
      ) {
        setDraftEntityTypesDetails(providedTypeDetails);
      }
    }, [entity?.metadata.entityTypeIds, providedTypeDetails]);

    const entityWithLinksAndTypesAvailableLocally = useMemo(() => {
      if (!localEntitySubgraph || !draftEntityTypesDetails || !entity) {
        return false;
      }

      if (
        !isClosedMultiEntityTypeForEntityTypeIds(
          draftEntityTypesDetails.closedMultiEntityType,
          entity.metadata.entityTypeIds,
        )
      ) {
        return false;
      }

      /**
       * If the provided subgraph doesn't have a depth of 1 for these traversal options,
       * it doesn't contain the incoming and outgoing links from the entity.
       */
      if (
        localEntitySubgraph.depths.hasLeftEntity.incoming === 0 ||
        localEntitySubgraph.depths.hasLeftEntity.outgoing === 0 ||
        localEntitySubgraph.depths.hasRightEntity.incoming === 0 ||
        localEntitySubgraph.depths.hasRightEntity.outgoing === 0
      ) {
        return false;
      }

      /**
       * If the entity isn't in the subgraph roots, it may not have the links to/from it.
       */
      const roots = getRoots(localEntitySubgraph);
      const containsRequestedEntity = roots.some(
        (root) => root.entityId === providedEntityId,
      );

      return containsRequestedEntity;
    }, [
      entity,
      draftEntityTypesDetails,
      localEntitySubgraph,
      providedEntityId,
    ]);

    /**
     * If the parent component didn't have the entitySubgraph already available,
     * or it doesn't contain links to/from the request entity,
     * we need to fetch it and set it in the local state (from where it will be updated if the user uses the editor
     * form).
     */
    const { data: fetchedEntityData, refetch } = useQuery<
      GetEntitySubgraphQuery,
      GetEntitySubgraphQueryVariables
    >(getEntitySubgraphQuery, {
      fetchPolicy: "cache-and-network",
      onCompleted: (data) => {
        const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
          data.getEntitySubgraph.subgraph,
        );

        setLocalEntitySubgraph(subgraph);

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

        const closedMultiEntityType = getClosedMultiEntityTypeFromMap(
          closedMultiEntityTypes,
          returnedEntity.metadata.entityTypeIds,
        );

        setDraftEntityTypesDetails({
          closedMultiEntityType,
          closedMultiEntityTypesDefinitions: definitions,
        });
      },
      skip:
        entityWithLinksAndTypesAvailableLocally &&
        !!providedClosedMultiEntityTypesDefinitions,
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
    });

    const originalEntitySubgraph = useMemo(() => {
      if (fetchedEntityData) {
        return mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
          fetchedEntityData.getEntitySubgraph.subgraph,
        );
      }

      if (providedEntitySubgraph) {
        return providedEntitySubgraph;
      }

      return null;
    }, [providedEntitySubgraph, fetchedEntityData]);

    const [savingChanges, setSavingChanges] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    const [updateEntity] = useMutation<
      UpdateEntityMutation,
      UpdateEntityMutationVariables
    >(updateEntityMutation);

    const entityLabel = useMemo(
      () =>
        draftEntityTypesDetails?.closedMultiEntityType && entity
          ? generateEntityLabel(
              draftEntityTypesDetails.closedMultiEntityType,
              entity,
            )
          : "",
      [entity, draftEntityTypesDetails],
    );

    const resetEntityEditor = useCallback(() => {
      setDraftLinksToCreate([]);
      setDraftLinksToArchive([]);
      setIsDirty(false);
    }, [setDraftLinksToCreate, setDraftLinksToArchive, setIsDirty]);

    const handleDiscardChanges = useCallback(() => {
      resetEntityEditor();
    }, [resetEntityEditor]);

    const { shortname: entityOwningShortname } =
      useUserOrOrgShortnameByOwnedById({ ownedById });

    const handleSaveChanges = useCallback(async () => {
      if (!localEntitySubgraph || !originalEntitySubgraph) {
        throw new Error(`No original entity available`);
      }

      const draftEntity = getRoots(localEntitySubgraph)[0];
      const oldEntity = getRoots(originalEntitySubgraph)[0];

      if (!oldEntity) {
        throw new Error(
          `No original entity available in originalEntitySubgraph`,
        );
      }

      if (!draftEntity) {
        return;
      }

      try {
        setSavingChanges(true);

        await applyDraftLinkEntityChanges(
          draftEntity,
          draftLinksToCreate,
          draftLinksToArchive,
        );

        /** @todo add validation here */
        const updateEntityResponse = await updateEntity({
          variables: {
            entityUpdate: {
              entityId: draftEntity.metadata.recordId.entityId,
              propertyPatches: patchesFromPropertyObjects({
                oldProperties: oldEntity.properties,
                newProperties: mergePropertyObjectAndMetadata(
                  draftEntity.properties,
                  undefined,
                ),
              }),
              entityTypeIds: draftEntity.metadata.entityTypeIds,
            },
          },
        });

        if (!updateEntityResponse.data) {
          throw new Error("Updating entity failed");
        }

        resetEntityEditor();
        onSubmit();
      } catch {
        setSavingChanges(false);
      }
    }, [
      applyDraftLinkEntityChanges,
      draftLinksToArchive,
      draftLinksToCreate,
      originalEntitySubgraph,
      localEntitySubgraph,
      onSubmit,
      resetEntityEditor,
      updateEntity,
    ]);

    const [validationReport, setValidationReport] =
      useState<MinimalEntityValidationReport | null>(null);

    const { validateEntity: validateFn } = useValidateEntity();

    const validateEntity = useCallback(
      async (entityToValidate: Entity) => {
        const report = await validateFn({
          properties: entityToValidate.propertiesWithMetadata,
          entityTypeIds: entityToValidate.metadata.entityTypeIds,
        });

        setValidationReport(report);
      },
      [validateFn],
    );

    const submitDisabled =
      !!validationReport ||
      (!isDirty && !draftLinksToCreate.length && !draftLinksToArchive.length);

    const { icon, isLink } = draftEntityTypesDetails
      ? getDisplayFieldsForClosedEntityType(
          draftEntityTypesDetails.closedMultiEntityType,
        )
      : { icon: null, isLink: false };

    if (
      !entity ||
      !localEntitySubgraph ||
      !entityWithLinksAndTypesAvailableLocally ||
      !draftEntityTypesDetails ||
      entity.entityId !== providedEntityId
    ) {
      return (
        <Stack gap={3} p={5}>
          <Skeleton height={60} />
          <Skeleton height={90} />
          <Skeleton height={500} />
        </Stack>
      );
    }

    return (
      <Box>
        {entity.metadata.archived && (
          <Box mb={1}>
            <ArchivedItemBanner item={entity} onUnarchived={refetch} />
          </Box>
        )}
        <Stack gap={5} px={6} pb={5} pt={1}>
          <Stack alignItems="flex-start" direction="row">
            <Stack alignItems="flex-start" direction="row">
              <EntityOrTypeIcon
                entity={entity}
                icon={icon}
                isLink={isLink}
                fill={({ palette }) => palette.gray[50]}
                fontSize={40}
              />
              <Typography
                variant="h2"
                color="gray.90"
                fontWeight="bold"
                ml={2}
                sx={{ lineHeight: 1 }}
              >
                {entityLabel}
              </Typography>
              {entityOwningShortname && !hideOpenInNew && (
                <Link
                  href={generateEntityPath({
                    shortname: entityOwningShortname,
                    entityId: entity.metadata.recordId.entityId,
                    includeDraftId: true,
                  })}
                  target="_blank"
                >
                  <ArrowUpRightFromSquareRegularIcon
                    sx={{
                      fill: ({ palette }) => palette.blue[70],
                      fontSize: 18,
                      ml: 1.2,
                    }}
                  />
                </Link>
              )}
            </Stack>
          </Stack>

          <EntityEditor
            closedMultiEntityTypesMap={
              fetchedEntityData?.getEntitySubgraph.closedMultiEntityTypes ??
              providedClosedMultiEntityTypesMap ??
              null
            }
            customColumns={customColumns}
            {...draftEntityTypesDetails}
            defaultOutgoingLinkFilters={defaultOutgoingLinkFilters}
            readonly={isReadOnly}
            onEntityUpdated={null}
            entityLabel={entityLabel}
            entitySubgraph={localEntitySubgraph}
            handleTypesChange={async (change) => {
              const newEntity = await handleTypeChanges(change);

              const originalEntity = originalEntitySubgraph
                ? getRoots(originalEntitySubgraph)[0]
                : undefined;

              setIsDirty(
                JSON.stringify(change.entityTypeIds.toSorted()) !==
                  JSON.stringify(
                    originalEntity?.metadata.entityTypeIds.toSorted(),
                  ),
              );

              await validateEntity(newEntity);
            }}
            setEntity={async (changedEntity) => {
              setLocalEntitySubgraph((prev) =>
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
            isDirty={isDirty}
            onEntityClick={(entityId) => {
              pushToStack({ type: "entity", itemId: entityId, onSubmit });
            }}
            onTypeClick={(kind, url) => {
              pushToStack({ type: kind, itemId: url });
            }}
            draftLinksToCreate={draftLinksToCreate}
            setDraftLinksToCreate={setDraftLinksToCreate}
            draftLinksToArchive={draftLinksToArchive}
            setDraftLinksToArchive={setDraftLinksToArchive}
            slideContainerRef={slideContainerRef}
            validationReport={null}
          />
          {!isReadOnly && (
            <Stack direction="row" gap={3}>
              <Button
                onClick={handleSaveChanges}
                loading={savingChanges}
                disabled={submitDisabled}
              >
                Save Changes
              </Button>
              <Button onClick={handleDiscardChanges} variant="tertiary">
                Discard
              </Button>
            </Stack>
          )}
        </Stack>
      </Box>
    );
  },
);
