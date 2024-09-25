import { useMutation, useQuery } from "@apollo/client";
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
import { useCallback, useMemo, useState } from "react";

import type {
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../../../graphql/api-types.gen";
import { updateEntityMutation } from "../../../../../graphql/queries/knowledge/entity.queries";
import { queryEntityTypesQuery } from "../../../../../graphql/queries/ontology/entity-type.queries";
import { Link } from "../../../../../shared/ui/link";
import { SectionWrapper } from "../../../shared/section-wrapper";
import { useEntityEditor } from "./entity-editor-context";
import { EntityTypeUpdateModal } from "./types-section/entity-type-update-modal";
import { Button } from "../../../../../shared/ui/button";
import { EntityTypeSelector } from "../../../../shared/entity-type-selector";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  hiddenEntityTypeIds,
  nonAssignableTypes,
} from "../../../../shared/hidden-types";

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

  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updatingVersion, setUpdatingVersion] = useState(false);

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const handleUpdateVersion = async () => {
    if (!newerEntityType) {
      return;
    }

    try {
      setUpdatingVersion(true);

      const newEntityTypeIds = entity.metadata.entityTypeIds.map(
        (entityTypeId) => {
          if (entityTypeId === currentEntityType.schema.$id) {
            return newerEntityType.schema.$id;
          }

          return entityTypeId;
        },
      );

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
      setUpdateModalOpen(false);
      setUpdatingVersion(false);
    }
  };

  const handleDeleteType = useCallback(() => {}, []);

  const closeModal = () => setUpdateModalOpen(false);
  const openModal = () => setUpdateModalOpen(true);

  const entityTypeId = currentEntityType.schema.$id;
  const entityTypeTitle = currentEntityType.schema.title;
  const currentVersion = currentEntityType.metadata.recordId.version;

  return (
    <>
      <TypeCard
        LinkComponent={Link}
        onDelete={handleDeleteType}
        url={entityTypeId}
        title={entityTypeTitle}
        version={currentVersion}
        newVersionConfig={
          !readonly && newVersion
            ? {
                newVersion,
                onUpdateVersion: openModal,
              }
            : undefined
        }
      />
      {newVersion && (
        <EntityTypeUpdateModal
          open={updateModalOpen}
          onClose={closeModal}
          currentVersion={currentEntityType.metadata.recordId.version}
          newVersion={newVersion}
          entityTypeTitle={currentEntityType.schema.title}
          onUpdateVersion={handleUpdateVersion}
          updatingVersion={updatingVersion}
        />
      )}
    </>
  );
};

export const TypesSection = () => {
  const { entitySubgraph, onEntityUpdated, readonly } = useEntityEditor();

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

  const [addingType, setAddingType] = useState(false);

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
        {!readonly &&
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
                  console.log(entityType);
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
