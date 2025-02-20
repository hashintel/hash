import { useMutation, useQuery } from "@apollo/client";
import {
  ArrowUpRightFromSquareRegularIcon,
  EntityOrTypeIcon,
  Skeleton,
} from "@hashintel/design-system";
import {
  type Entity,
  getClosedMultiEntityTypeFromMap,
  getDisplayFieldsForClosedEntityType,
  mergePropertyObjectAndMetadata,
  patchesFromPropertyObjects,
} from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";
import { generateEntityPath } from "@local/hash-isomorphic-utils/frontend-paths";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import {
  currentTimeInstantTemporalAxes,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { splitEntityId } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Box, Stack, Typography } from "@mui/material";
import { memo, useCallback, useMemo, useState } from "react";

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
import { Link } from "../../../shared/ui";
import type { EntityEditorProps } from "../../@/[shortname]/entities/[entity-uuid].page/entity-editor";
import { EntityEditor } from "../../@/[shortname]/entities/[entity-uuid].page/entity-editor";
import { createDraftEntitySubgraph } from "../../@/[shortname]/entities/[entity-uuid].page/shared/create-draft-entity-subgraph";
import { useApplyDraftLinkEntityChanges } from "../../@/[shortname]/entities/[entity-uuid].page/shared/use-apply-draft-link-entity-changes";
import { useDraftLinkState } from "../../@/[shortname]/entities/[entity-uuid].page/shared/use-draft-link-state";
import { useHandleTypeChanges } from "../../@/[shortname]/entities/[entity-uuid].page/shared/use-handle-type-changes";
import { ArchivedItemBanner } from "../top-context-bar/archived-item-banner";
import type { MinimalEntityValidationReport } from "../use-validate-entity";
import { useValidateEntity } from "../use-validate-entity";
import { useSlideStack } from "./context";

export interface EntitySlideProps {
  /**
   * The default outgoing link filters to apply to the links tables in the entity editor
   */
  defaultOutgoingLinkFilters?: EntityEditorProps["defaultOutgoingLinkFilters"];
  /**
   * Hide the link to open the entity in a new tab.
   */
  hideOpenInNew?: boolean;
  /**
   * When the entity is updated, call this function with the updated entity's entityId.
   */
  onUpdateEntity?: (entityId: EntityId) => void;
  entityId: EntityId;
}

export const EntitySlide = memo(
  ({
    defaultOutgoingLinkFilters,
    entityId: providedEntityId,
    hideOpenInNew,
    onUpdateEntity,
  }: EntitySlideProps) => {
    const [localEntitySubgraph, setLocalEntitySubgraph] = useState<
      Subgraph<EntityRootType> | undefined
    >();

    const { customEntityLinksColumns, pushToSlideStack, slideContainerRef } =
      useSlideStack();

    const entity = localEntitySubgraph
      ? getRoots(localEntitySubgraph)[0]
      : null;

    const [ownedById, entityUuid, draftId] = splitEntityId(providedEntityId);

    const [draftEntityTypesDetails, setDraftEntityTypesDetails] = useState<
      | Pick<
          EntityEditorProps,
          "closedMultiEntityType" | "closedMultiEntityTypesDefinitions"
        >
      | undefined
    >();

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
    }, [fetchedEntityData]);

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
        onUpdateEntity?.(draftEntity.metadata.recordId.entityId);
      } catch {
        setSavingChanges(false);
      }
    }, [
      applyDraftLinkEntityChanges,
      draftLinksToArchive,
      draftLinksToCreate,
      originalEntitySubgraph,
      localEntitySubgraph,
      onUpdateEntity,
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
            <Stack
              alignItems="flex-start"
              direction="row"
              justifyContent="flex-start"
            >
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
                      fontSize: 24,
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
              null
            }
            customEntityLinksColumns={customEntityLinksColumns}
            {...draftEntityTypesDetails}
            defaultOutgoingLinkFilters={defaultOutgoingLinkFilters}
            readonly={false}
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
              pushToSlideStack({ kind: "entity", itemId: entityId });
            }}
            onTypeClick={(kind, url) => {
              pushToSlideStack({ kind, itemId: url });
            }}
            draftLinksToCreate={draftLinksToCreate}
            setDraftLinksToCreate={setDraftLinksToCreate}
            draftLinksToArchive={draftLinksToArchive}
            setDraftLinksToArchive={setDraftLinksToArchive}
            slideContainerRef={slideContainerRef ?? undefined}
            validationReport={null}
          />
        </Stack>
      </Box>
    );
  },
);
