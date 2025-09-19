import { useQuery } from "@apollo/client";
import type { EntityTypeRootType } from "@blockprotocol/graph";
import { getRoots } from "@blockprotocol/graph/stdlib";
import type {
  Entity,
  OntologyTypeVersion,
  VersionedUrl,
} from "@blockprotocol/type-system";
import {
  compareOntologyTypeVersions,
  componentsFromVersionedUrl,
  mustHaveAtLeastOne,
} from "@blockprotocol/type-system";
import { PlusIcon, TypeCard } from "@hashintel/design-system";
import { linkEntityTypeUrl } from "@hashintel/type-editor/src/shared/urls";
import { getDisplayFieldsForClosedEntityType } from "@local/hash-graph-sdk/entity";
import { deserializeQueryEntityTypeSubgraphResponse } from "@local/hash-graph-sdk/entity-type";
import {
  fullTransactionTimeAxis,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { Box, Stack } from "@mui/material";
import { useMemo, useState } from "react";

import type {
  QueryEntityTypeSubgraphQuery,
  QueryEntityTypeSubgraphQueryVariables,
} from "../../../../graphql/api-types.gen";
import { queryEntityTypeSubgraphQuery } from "../../../../graphql/queries/ontology/entity-type.queries";
import { generateLinkParameters } from "../../../../shared/generate-link-parameters";
import { Button } from "../../../../shared/ui/button";
import { Link } from "../../../../shared/ui/link";
import { EntityTypeSelector } from "../../entity-type-selector";
import { nonAssignableTypes } from "../../hidden-types";
import { SectionWrapper } from "../../section-wrapper";
import type { EntityEditorProps } from "../entity-editor";
import { useEntityEditor } from "./entity-editor-context";
import type { EntityTypeChangeDetails } from "./types-section/entity-type-change-modal";
import { EntityTypeChangeModal } from "./types-section/entity-type-change-modal";
import { useGetTypeChangeDetails } from "./types-section/use-get-type-change-details";

type MinimalTypeData = {
  entityTypeId: VersionedUrl;
  entityTypeTitle: string;
  icon?: string;
  isLink: boolean;
  version: OntologyTypeVersion;
};

export const TypeButton = ({
  allowDelete,
  entity,
  currentEntityType,
  newerEntityType,
}: {
  allowDelete: boolean;
  entity: Entity;
  currentEntityType: MinimalTypeData;
  newerEntityType?: Pick<MinimalTypeData, "entityTypeId" | "version">;
}) => {
  const { readonly, handleTypesChange, onTypeClick } = useEntityEditor();

  const newVersion = newerEntityType?.version;

  const [changeDetails, setChangeDetails] =
    useState<EntityTypeChangeDetails | null>(null);

  const [updatingTypes, setUpdatingTypes] = useState(false);

  const getTypeDetails = useGetTypeChangeDetails();

  const handleUpdateTypes: EntityEditorProps["handleTypesChange"] = async ({
    entityTypeIds,
    removedLinkTypesBaseUrls,
    removedPropertiesBaseUrls,
  }) => {
    try {
      await handleTypesChange({
        entityTypeIds,
        removedPropertiesBaseUrls,
        removedLinkTypesBaseUrls,
      });
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
      onAccept: async ({
        removedLinkTypesBaseUrls,
        removedPropertiesBaseUrls,
      }) => {
        await handleUpdateTypes({
          entityTypeIds: mustHaveAtLeastOne(newEntityTypeIds),
          removedPropertiesBaseUrls,
          removedLinkTypesBaseUrls,
        });
      },
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
      onAccept: ({ removedLinkTypesBaseUrls, removedPropertiesBaseUrls }) =>
        handleUpdateTypes({
          entityTypeIds: mustHaveAtLeastOne(newEntityTypeIds),
          removedLinkTypesBaseUrls,
          removedPropertiesBaseUrls,
        }),
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
        LinkComponent={Link}
        icon={currentEntityType.icon}
        isLink={currentEntityType.isLink}
        onClick={() => onTypeClick("entityType", entityTypeId)}
        onDelete={readonly || !allowDelete ? undefined : onDeleteClicked}
        url={generateLinkParameters(entityTypeId).href}
        title={entityTypeTitle}
        version={currentVersion}
        newVersionConfig={
          !readonly && newVersion
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
  const { entity, closedMultiEntityType, readonly, handleTypesChange } =
    useEntityEditor();

  const { data: latestEntityTypesData } = useQuery<
    QueryEntityTypeSubgraphQuery,
    QueryEntityTypeSubgraphQueryVariables
  >(queryEntityTypeSubgraphQuery, {
    fetchPolicy: "cache-and-network",
    variables: {
      request: {
        filter: { all: [] },
        temporalAxes: fullTransactionTimeAxis,
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          constrainsValuesOn: { outgoing: 0 },
          constrainsPropertiesOn: { outgoing: 255 },
          constrainsLinksOn: { outgoing: 1 },
          constrainsLinkDestinationsOn: { outgoing: 0 },
          inheritsFrom: { outgoing: 255 },
        },
      },
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
      ? deserializeQueryEntityTypeSubgraphResponse(
          latestEntityTypesData.queryEntityTypeSubgraph,
        ).subgraph
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
          compareOntologyTypeVersions(type.metadata.recordId.version, version) >
            0,
      );

      const { icon } = getDisplayFieldsForClosedEntityType(currentTypeMetadata);

      const currentEntityType: MinimalTypeData = {
        entityTypeId: currentTypeMetadata.$id,
        entityTypeTitle: currentTypeMetadata.title,
        icon,
        isLink: !!currentTypeMetadata.allOf.some(
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
    const newEntityTypeIds = mustHaveAtLeastOne([
      ...entity.metadata.entityTypeIds,
      entityTypeId,
    ]);

    try {
      setAddingType(true);

      await handleTypesChange({
        entityTypeIds: newEntityTypeIds,
        removedPropertiesBaseUrls: [],
        removedLinkTypesBaseUrls: [],
      });
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
            allowDelete={entityTypes.length !== 1}
            currentEntityType={currentEntityType}
            key={currentEntityType.entityTypeId}
            entity={entity}
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
