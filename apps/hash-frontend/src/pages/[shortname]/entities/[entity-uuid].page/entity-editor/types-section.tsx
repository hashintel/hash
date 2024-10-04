import { useMutation, useQuery } from "@apollo/client";
import type { VersionedUrl } from "@blockprotocol/type-system-rs/pkg/type-system";
import { PlusIcon, TypeCard } from "@hashintel/design-system";
import { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityTypeWithMetadata } from "@local/hash-graph-types/ontology";
import {
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { EntityTypeRootType } from "@local/hash-subgraph";
import { getEntityTypeById, getRoots } from "@local/hash-subgraph/stdlib";
import { Box, Stack } from "@mui/material";
import { useMemo, useState } from "react";

import type {
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../../../graphql/api-types.gen";
import { updateEntityMutation } from "../../../../../graphql/queries/knowledge/entity.queries";
import { queryEntityTypesQuery } from "../../../../../graphql/queries/ontology/entity-type.queries";
import { Button } from "../../../../../shared/ui/button";
import { Link } from "../../../../../shared/ui/link";
import { EntityTypeSelector } from "../../../../shared/entity-type-selector";
import { nonAssignableTypes } from "../../../../shared/hidden-types";
import { SectionWrapper } from "../../../shared/section-wrapper";
import { useEntityEditor } from "./entity-editor-context";
import type { EntityTypeChangeDetails } from "./types-section/entity-type-change-modal";
import { EntityTypeChangeModal } from "./types-section/entity-type-change-modal";

export const TypeButton = ({
  entity,
  currentEntityType,
  newerEntityType,
}: {
  entity: Entity;
  currentEntityType: EntityTypeWithMetadata;
  newerEntityType?: EntityTypeWithMetadata;
}) => {
  const { onEntityUpdated, readonly } = useEntityEditor();

  const newVersion = newerEntityType?.metadata.recordId.version;

  const [changeDetails, setChangeDetails] =
    useState<EntityTypeChangeDetails | null>(null);

  const [updatingTypes, setUpdatingTypes] = useState(false);

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const handleUpdateTypes = async (newEntityTypeIds: VersionedUrl[]) => {
    try {
      setUpdatingTypes(true);

      const res = await updateEntity({
        variables: {
          entityUpdate: {
            entityTypeIds: newEntityTypeIds,
            entityId: entity.metadata.recordId.entityId,
            propertyPatches: [],
          },
        },
      });

      if (res.data) {
        onEntityUpdated?.(new Entity(res.data.updateEntity));
      }
    } finally {
      setChangeDetails(null);
      setUpdatingTypes(false);
    }
  };

  const onUpgradeClicked = () => {
    if (!newerEntityType) {
      throw new Error(`No newer entity type to upgrade to`);
    }

    const newEntityTypeIds = entity.metadata.entityTypeIds.map(
      (entityTypeId) => {
        if (entityTypeId === currentEntityType.schema.$id) {
          return newerEntityType.schema.$id;
        }

        return entityTypeId;
      },
    );

    setChangeDetails({
      onAccept: () => handleUpdateTypes(newEntityTypeIds),
      proposedChange: {
        type: "Update",
        entityTypeTitle: currentEntityType.schema.title,
        currentVersion: currentEntityType.metadata.recordId.version,
        newVersion: newerEntityType.metadata.recordId.version,
      },
      /**
       * @todo H-3408: Calculate and show property/link changes when upgrading entity types
       */
      linkChanges: [],
      propertyChanges: [],
    });
  };

  const onDeleteClicked = () => {
    const newEntityTypeIds = entity.metadata.entityTypeIds.filter(
      (entityTypeId) => entityTypeId !== currentEntityType.schema.$id,
    );

    setChangeDetails({
      onAccept: () => handleUpdateTypes(newEntityTypeIds),
      proposedChange: {
        type: "Remove",
        entityTypeTitle: currentEntityType.schema.title,
        currentVersion: currentEntityType.metadata.recordId.version,
      },
      /**
       * @todo H-3408: Calculate and show property/link changes when removing entity types
       */
      linkChanges: [],
      propertyChanges: [],
    });
  };

  const closeModal = () => setChangeDetails(null);

  const entityTypeId = currentEntityType.schema.$id;
  const entityTypeTitle = currentEntityType.schema.title;
  const currentVersion = currentEntityType.metadata.recordId.version;

  /**
   * @todo H-3379 bring changes to types into the same 'local draft changes' system as properties/links changes,
   *    which enables the user to make type changes before the entity is persisted to the db.
   */
  const isNotYetInDb = entity.metadata.recordId.entityId.includes("draft");
  const canChangeTypes = !readonly && !isNotYetInDb;

  return (
    <>
      <TypeCard
        LinkComponent={Link}
        onDelete={canChangeTypes ? onDeleteClicked : undefined}
        url={entityTypeId}
        title={entityTypeTitle}
        version={currentVersion}
        newVersionConfig={
          canChangeTypes && newVersion
            ? {
                newVersion,
                onUpdateVersion: onUpgradeClicked,
              }
            : undefined
        }
      />
      {changeDetails && (
        <EntityTypeChangeModal
          changeIsProcessing={updatingTypes}
          open
          onReject={closeModal}
          {...changeDetails}
        />
      )}
    </>
  );
};

export const TypesSection = () => {
  const { entitySubgraph, readonly, onEntityUpdated } = useEntityEditor();

  const entity = getRoots(entitySubgraph)[0]!;

  const {
    metadata: { entityTypeIds },
  } = entity;

  const { data: latestEntityTypesData } = useQuery<
    QueryEntityTypesQuery,
    QueryEntityTypesQueryVariables
  >(queryEntityTypesQuery, {
    fetchPolicy: "cache-and-network",
    variables: {
      ...zeroedGraphResolveDepths,
      constrainsValuesOn: { outgoing: 0 },
      constrainsPropertiesOn: { outgoing: 255 },
      constrainsLinksOn: { outgoing: 1 },
      constrainsLinkDestinationsOn: { outgoing: 0 },
      inheritsFrom: { outgoing: 255 },
      latestOnly: false,
      includeArchived: true,
    },
  });

  const entityTypes = useMemo<
    {
      currentEntityType: EntityTypeWithMetadata;
      newerEntityType?: EntityTypeWithMetadata;
    }[]
  >(() => {
    const typedSubgraph = latestEntityTypesData
      ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityTypeRootType>(
          latestEntityTypesData.queryEntityTypes,
        )
      : null;

    const latestEntityTypes = typedSubgraph
      ? getRoots<EntityTypeRootType>(typedSubgraph)
      : [];

    return entityTypeIds.map((entityTypeId) => {
      const currentEntityType = getEntityTypeById(entitySubgraph, entityTypeId);

      if (!currentEntityType) {
        throw new Error(
          `Could not find entity type with id ${entityTypeId} in subgraph`,
        );
      }

      const newerEntityType = latestEntityTypes.find(
        (type) =>
          type.metadata.recordId.baseUrl ===
            currentEntityType.metadata.recordId.baseUrl &&
          type.metadata.recordId.version >
            currentEntityType.metadata.recordId.version,
      );

      return { currentEntityType, newerEntityType };
    });
  }, [entitySubgraph, entityTypeIds, latestEntityTypesData]);

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const [addingType, setAddingType] = useState(false);

  const onNewTypeSelected = async (entityTypeId: VersionedUrl) => {
    try {
      setAddingType(true);

      const res = await updateEntity({
        variables: {
          entityUpdate: {
            entityTypeIds: [...entityTypeIds, entityTypeId],
            entityId: entity.metadata.recordId.entityId,
            propertyPatches: [],
          },
        },
      });

      if (res.data) {
        onEntityUpdated?.(new Entity(res.data.updateEntity));
      }
    } finally {
      setAddingType(false);
    }
  };

  /**
   * @todo H-3379 bring changes to types into the same 'local draft changes' system as properties/links changes,
   *    which enables the user to make type changes before the entity is persisted to the db.
   */
  const isNotYetInDb = entity.metadata.recordId.entityId.includes("draft");
  const canChangeTypes = !readonly && !isNotYetInDb;

  return (
    <SectionWrapper
      title="Types"
      titleTooltip="Types describe what an entity is, allowing information to be associated with it. Entities can have an unlimited number of types."
    >
      <Stack alignItems="center" direction="row" gap={1.5}>
        {entityTypes.map(({ currentEntityType, newerEntityType }) => (
          <TypeButton
            key={currentEntityType.schema.$id}
            entity={entity}
            currentEntityType={currentEntityType}
            newerEntityType={newerEntityType}
          />
        ))}
        {canChangeTypes &&
          (addingType ? (
            <Box component="form" sx={{ flexGrow: 1 }}>
              <EntityTypeSelector
                excludeEntityTypeIds={[
                  ...entityTypes.flatMap(
                    ({ currentEntityType, newerEntityType }) =>
                      [
                        currentEntityType.schema.$id,
                        newerEntityType?.schema.$id ?? [],
                      ].flat(),
                  ),
                  ...nonAssignableTypes,
                ]}
                disableCreate
                inputHeight={40}
                onSelect={(entityType) => {
                  void onNewTypeSelected(entityType.schema.$id);
                }}
                onCancel={() => setAddingType(false)}
                sx={{
                  maxWidth: 600,
                }}
              />
            </Box>
          ) : (
            <Button
              onClick={() => setAddingType(true)}
              variant="tertiary_quiet"
              size="xs"
              sx={{
                background: "none",
                color: ({ palette }) => palette.gray[90],
                fontWeight: 600,
                height: 40,
              }}
            >
              ADD TYPE <PlusIcon sx={{ fontSize: 14, ml: 0.5, mb: 0.2 }} />
            </Button>
          ))}
      </Stack>
    </SectionWrapper>
  );
};
