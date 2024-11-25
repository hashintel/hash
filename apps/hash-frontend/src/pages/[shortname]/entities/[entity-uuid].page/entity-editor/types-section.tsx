import { useQuery } from "@apollo/client";
import type { VersionedUrl } from "@blockprotocol/type-system/slim";
import { PlusIcon, TypeCard } from "@hashintel/design-system";
import type { Entity } from "@local/hash-graph-sdk/entity";
import {
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type { EntityTypeRootType } from "@local/hash-subgraph";
import { linkEntityTypeUrl } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { componentsFromVersionedUrl } from "@local/hash-subgraph/type-system-patch";
import { Box, Stack } from "@mui/material";
import { useMemo, useState } from "react";

import type {
  QueryEntityTypesQuery,
  QueryEntityTypesQueryVariables,
} from "../../../../../graphql/api-types.gen";
import { queryEntityTypesQuery } from "../../../../../graphql/queries/ontology/entity-type.queries";
import { Button } from "../../../../../shared/ui/button";
import { Link } from "../../../../../shared/ui/link";
import { EntityTypeSelector } from "../../../../shared/entity-type-selector";
import { nonAssignableTypes } from "../../../../shared/hidden-types";
import { SectionWrapper } from "../../../../shared/section-wrapper";
import { useEntityEditor } from "./entity-editor-context";
import type { EntityTypeChangeDetails } from "./types-section/entity-type-change-modal";
import { EntityTypeChangeModal } from "./types-section/entity-type-change-modal";
import { useGetTypeChangeDetails } from "./types-section/use-get-type-change-details";

type MinimalTypeData = {
  entityTypeId: VersionedUrl;
  entityTypeTitle: string;
  icon?: string;
  isLink: boolean;
  version: number;
};

export const TypeButton = ({
  entity,
  currentEntityType,
  newerEntityType,
}: {
  entity: Entity;
  currentEntityType: MinimalTypeData;
  newerEntityType?: Pick<MinimalTypeData, "entityTypeId" | "version">;
}) => {
  const { disableTypeClick, readonly, setEntityTypes } = useEntityEditor();

  const newVersion = newerEntityType?.version;

  const [changeDetails, setChangeDetails] =
    useState<EntityTypeChangeDetails | null>(null);

  const [updatingTypes, setUpdatingTypes] = useState(false);

  const getTypeDetails = useGetTypeChangeDetails();

  const handleUpdateTypes = async (newEntityTypeIds: VersionedUrl[]) => {
    try {
      await setEntityTypes(newEntityTypeIds);
      setChangeDetails(null);
    } finally {
      setUpdatingTypes(false);
    }
  };

  const onUpgradeClicked = async () => {
    if (!newerEntityType) {
      throw new Error(`No newer entity type to upgrade to`);
    }

    const newEntityTypeIds = entity.metadata.entityTypeIds.map(
      (entityTypeId) => {
        if (entityTypeId === currentEntityType.entityTypeId) {
          return newerEntityType.entityTypeId;
        }

        return entityTypeId;
      },
    );

    const { linkChanges, propertyChanges } =
      await getTypeDetails(newEntityTypeIds);

    setChangeDetails({
      onAccept: () => handleUpdateTypes(newEntityTypeIds),
      proposedChange: {
        type: "Update",
        entityTypeTitle: currentEntityType.entityTypeTitle,
        currentVersion: currentEntityType.version,
        newVersion: newerEntityType.version,
      },
      linkChanges,
      propertyChanges,
    });
  };

  const onDeleteClicked = async () => {
    const newEntityTypeIds = entity.metadata.entityTypeIds.filter(
      (entityTypeId) => entityTypeId !== currentEntityType.entityTypeId,
    );

    const { linkChanges, propertyChanges } =
      await getTypeDetails(newEntityTypeIds);

    setChangeDetails({
      onAccept: () => handleUpdateTypes(newEntityTypeIds),
      proposedChange: {
        type: "Remove",
        entityTypeTitle: currentEntityType.entityTypeTitle,
        currentVersion: currentEntityType.version,
      },
      linkChanges,
      propertyChanges,
    });
  };

  const closeModal = () => setChangeDetails(null);

  const entityTypeId = currentEntityType.entityTypeId;
  const entityTypeTitle = currentEntityType.entityTypeTitle;
  const currentVersion = currentEntityType.version;

  return (
    <>
      <TypeCard
        disableClick={disableTypeClick}
        LinkComponent={Link}
        icon={currentEntityType.icon}
        isLink={currentEntityType.isLink}
        onDelete={readonly ? onDeleteClicked : undefined}
        url={entityTypeId}
        title={entityTypeTitle}
        version={currentVersion}
        newVersionConfig={
          readonly && newVersion
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
  const { entitySubgraph, closedMultiEntityType, readonly, setEntityTypes } =
    useEntityEditor();

  const entity = getRoots(entitySubgraph)[0]!;

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
    skip: readonly,
  });

  const entityTypes = useMemo<
    {
      currentEntityType: MinimalTypeData;
      newerEntityType?: Pick<MinimalTypeData, "entityTypeId" | "version">;
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

    return closedMultiEntityType.allOf.map((currentTypeMetadata) => {
      const { baseUrl, version } = componentsFromVersionedUrl(
        currentTypeMetadata.$id,
      );

      const newerEntityType = latestEntityTypes.find(
        (type) =>
          type.metadata.recordId.baseUrl === baseUrl &&
          type.metadata.recordId.version > version,
      );

      const currentEntityType: MinimalTypeData = {
        entityTypeId: currentTypeMetadata.$id,
        entityTypeTitle: currentTypeMetadata.title,
        icon: currentTypeMetadata.icon,
        isLink: !!currentTypeMetadata.allOf?.some(
          (parent) => parent.$id === linkEntityTypeUrl,
        ),
        version,
      };

      return {
        currentEntityType,
        newerEntityType: newerEntityType
          ? {
              entityTypeId: newerEntityType.schema.$id,
              version: newerEntityType.metadata.recordId.version,
            }
          : undefined,
      };
    });
  }, [closedMultiEntityType, latestEntityTypesData]);

  const [addingType, setAddingType] = useState(false);

  const onNewTypeSelected = async (entityTypeId: VersionedUrl) => {
    const newEntityTypeIds = [...entity.metadata.entityTypeIds, entityTypeId];

    try {
      setAddingType(true);

      await setEntityTypes(newEntityTypeIds);
    } finally {
      setAddingType(false);
    }
  };

  return (
    <SectionWrapper
      title={readonly && entityTypes.length === 1 ? "Type" : "Types"}
      titleTooltip="Types describe what an entity is, allowing information to be associated with it. Entities can have an unlimited number of types."
    >
      <Stack alignItems="center" direction="row" gap={1.5}>
        {entityTypes.map(({ currentEntityType, newerEntityType }) => (
          <TypeButton
            key={currentEntityType.entityTypeId}
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
                        currentEntityType.entityTypeId,
                        newerEntityType?.entityTypeId ?? [],
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
