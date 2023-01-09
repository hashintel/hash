import { extractBaseUri, extractVersion } from "@blockprotocol/type-system";
import { EntityId } from "@hashintel/hash-shared/types";
import { versionedUriFromComponents } from "@hashintel/hash-subgraph/src/shared/type-system-patch";
import { getEntityTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/entity-type";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { Box } from "@mui/material";
import { useEffect, useState } from "react";

import { useBlockProtocolUpdateEntity } from "../../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-update-entity";
import { useBlockProtocolAggregateEntityTypes } from "../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-aggregate-entity-types";
import { SectionWrapper } from "../../../shared/section-wrapper";
import { useEntityEditor } from "./entity-editor-context";
import { EntityVersionUpdateModal } from "./types-section/entity-version-update-moda";
import { TypeCard } from "./types-section/type-card";

export const TypesSection = () => {
  const { entitySubgraph, refetch } = useEntityEditor();

  const entity = getRoots(entitySubgraph)[0]!;
  const { updateEntity } = useBlockProtocolUpdateEntity();
  const {
    metadata: { editionId, entityTypeId },
    properties,
  } = entity;

  const { aggregateEntityTypes } = useBlockProtocolAggregateEntityTypes();
  const [newVersion, setNewVersion] = useState<number>();
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updatingVersion, setUpdatingVersion] = useState(false);

  useEffect(() => {
    const init = async () => {
      const res = await aggregateEntityTypes({ data: {} });

      const entityTypeWithSameBaseId = res.data?.roots.find(
        (root) => root.baseId === extractBaseUri(entityTypeId),
      );

      if (!entityTypeWithSameBaseId) {
        return;
      }

      const currentEntityVersion = extractVersion(entityTypeId);

      if (entityTypeWithSameBaseId.version > currentEntityVersion) {
        setNewVersion(entityTypeWithSameBaseId.version);
      }
    };

    void init();
  }, [aggregateEntityTypes, entityTypeId]);

  const entityType = getEntityTypeById(entitySubgraph, entityTypeId);
  const entityTypeTitle = entityType?.schema.title ?? "";
  const entityTypeUrl = extractBaseUri(entityTypeId);

  const handleUpdateVersion = async () => {
    if (!newVersion) {
      return;
    }

    try {
      setUpdatingVersion(true);

      const res = await updateEntity({
        data: {
          entityTypeId: versionedUriFromComponents(entityTypeUrl, newVersion),
          entityId: editionId.baseId as EntityId,
          updatedProperties: properties,
        },
      });

      if (res.data) {
        await refetch();
        setNewVersion(undefined);
      }
    } finally {
      setUpdateModalOpen(false);
      setUpdatingVersion(false);
    }
  };

  const closeModal = () => setUpdateModalOpen(false);
  const openModal = () => setUpdateModalOpen(true);
  const currentVersion = extractVersion(entityTypeId);

  return (
    <SectionWrapper
      title="Types"
      titleTooltip="Types describe what an entity is, allowing information to be associated with it. Entities can have an unlimited number of types."
    >
      <Box display="flex" gap={2}>
        <TypeCard
          url={entityTypeUrl}
          title={entityTypeTitle}
          version={currentVersion}
          newVersionConfig={
            newVersion
              ? {
                  newVersion,
                  onUpdateVersion: openModal,
                }
              : undefined
          }
        />
      </Box>

      <EntityVersionUpdateModal
        open={updateModalOpen}
        onClose={closeModal}
        currentVersion={currentVersion}
        newVersion={newVersion}
        entityTypeTitle={entityTypeTitle}
        onUpdateVersion={handleUpdateVersion}
        updatingVersion={updatingVersion}
      />
    </SectionWrapper>
  );
};
