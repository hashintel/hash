import { extractBaseUri, extractVersion } from "@blockprotocol/type-system";
import { versionedUriFromComponents } from "@local/hash-subgraph/src/shared/type-system-patch";
import { getEntityTypeById } from "@local/hash-subgraph/src/stdlib/element/entity-type";
import { getRoots } from "@local/hash-subgraph/src/stdlib/roots";
import { EntityId } from "@local/hash-subgraph/src/types";
import { Box } from "@mui/material";
import { useEffect, useState } from "react";

import { useBlockProtocolUpdateEntity } from "../../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-update-entity";
import { useBlockProtocolAggregateEntityTypes } from "../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-aggregate-entity-types";
import { SectionWrapper } from "../../../shared/section-wrapper";
import { useEntityEditor } from "./entity-editor-context";
import { EntityTypeUpdateModal } from "./types-section/entity-type-update-modal";
import { TypeCard } from "./types-section/type-card";

export const TypesSection = () => {
  const { entitySubgraph, refetch, readonly } = useEntityEditor();

  const entity = getRoots(entitySubgraph)[0]!;
  const { updateEntity } = useBlockProtocolUpdateEntity();
  const {
    metadata: { recordId, entityTypeId },
    properties,
  } = entity;

  const { aggregateEntityTypes } = useBlockProtocolAggregateEntityTypes();
  const [newVersion, setNewVersion] = useState<number>();
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updatingVersion, setUpdatingVersion] = useState(false);

  useEffect(() => {
    const init = async () => {
      /** @todo instead of aggregating all types, use filtering by baseId when it's available to use */
      const res = await aggregateEntityTypes({
        data: {
          graphResolveDepths: {
            constrainsValuesOn: { outgoing: 0 },
            constrainsPropertiesOn: { outgoing: 0 },
            constrainsLinksOn: { outgoing: 0 },
            constrainsLinkDestinationsOn: { outgoing: 0 },
          },
        },
      });

      const baseId = extractBaseUri(entityTypeId);
      const entityTypeWithSameBaseId = res.data?.roots.find(
        (root) => root.baseId === baseId,
      );

      if (!entityTypeWithSameBaseId) {
        return;
      }

      const currentEntityVersion = extractVersion(entityTypeId);

      if (entityTypeWithSameBaseId.version > currentEntityVersion) {
        setNewVersion(entityTypeWithSameBaseId.version);
      }
    };

    if (!readonly) {
      void init();
    }
  }, [aggregateEntityTypes, entityTypeId, readonly]);

  const entityType = getEntityTypeById(entitySubgraph, entityTypeId);
  const entityTypeTitle = entityType?.schema.title ?? "";
  const entityTypeBaseUri = extractBaseUri(entityTypeId);

  const handleUpdateVersion = async () => {
    if (!newVersion) {
      return;
    }

    try {
      setUpdatingVersion(true);

      const res = await updateEntity({
        data: {
          entityTypeId: versionedUriFromComponents(
            entityTypeBaseUri,
            newVersion,
          ),
          entityId: recordId.entityId as EntityId,
          properties,
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
          url={entityTypeBaseUri}
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

      {newVersion && (
        <EntityTypeUpdateModal
          open={updateModalOpen}
          onClose={closeModal}
          currentVersion={currentVersion}
          newVersion={newVersion}
          entityTypeTitle={entityTypeTitle}
          onUpdateVersion={handleUpdateVersion}
          updatingVersion={updatingVersion}
        />
      )}
    </SectionWrapper>
  );
};
