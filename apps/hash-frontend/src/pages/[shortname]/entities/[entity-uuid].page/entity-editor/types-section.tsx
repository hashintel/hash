import { useMutation } from "@apollo/client";
import { extractVersion } from "@blockprotocol/type-system";
import { TypeCard } from "@hashintel/design-system";
import { Entity } from "@local/hash-graph-sdk/entity";
import { getEntityTypeById, getRoots } from "@local/hash-subgraph/stdlib";
import {
  extractBaseUrl,
  versionedUrlFromComponents,
} from "@local/hash-subgraph/type-system-patch";
import { Box } from "@mui/material";
import { useEffect, useState } from "react";

import { useBlockProtocolQueryEntityTypes } from "../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-query-entity-types";
import type {
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../../../graphql/api-types.gen";
import { updateEntityMutation } from "../../../../../graphql/queries/knowledge/entity.queries";
import { Link } from "../../../../../shared/ui/link";
import { SectionWrapper } from "../../../shared/section-wrapper";
import { useEntityEditor } from "./entity-editor-context";
import { EntityTypeUpdateModal } from "./types-section/entity-type-update-modal";

export const TypesSection = () => {
  const { entitySubgraph, onEntityUpdated, readonly } = useEntityEditor();

  const entity = getRoots(entitySubgraph)[0]!;

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const {
    metadata: { recordId, entityTypeId },
  } = entity;

  const { queryEntityTypes } = useBlockProtocolQueryEntityTypes();
  const [newVersion, setNewVersion] = useState<number>();
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updatingVersion, setUpdatingVersion] = useState(false);

  useEffect(() => {
    const init = async () => {
      /** @todo instead of aggregating all types, use filtering by baseId when it's available to use */
      const res = await queryEntityTypes({
        data: {
          graphResolveDepths: {
            constrainsValuesOn: { outgoing: 0 },
            constrainsPropertiesOn: { outgoing: 0 },
            constrainsLinksOn: { outgoing: 0 },
            constrainsLinkDestinationsOn: { outgoing: 0 },
          },
        },
      });

      const baseId = extractBaseUrl(entityTypeId);
      const entityTypeWithSameBaseId = res.data?.roots.find(
        (root) => root.baseId === baseId,
      );

      if (!entityTypeWithSameBaseId) {
        return;
      }

      const currentEntityTypeVersion = extractVersion(entityTypeId);
      const entityTypeWithSameBaseIdVersion = Number(
        entityTypeWithSameBaseId.revisionId,
      );

      if (entityTypeWithSameBaseIdVersion > currentEntityTypeVersion) {
        setNewVersion(entityTypeWithSameBaseIdVersion);
      }
    };

    if (!readonly) {
      void init();
    }
  }, [queryEntityTypes, entityTypeId, readonly]);

  const entityType = getEntityTypeById(entitySubgraph, entityTypeId);
  const entityTypeTitle = entityType?.schema.title ?? "";
  const entityTypeBaseUrl = extractBaseUrl(entityTypeId);

  const handleUpdateVersion = async () => {
    if (!newVersion) {
      return;
    }

    try {
      setUpdatingVersion(true);

      const res = await updateEntity({
        variables: {
          entityUpdate: {
            entityTypeId: versionedUrlFromComponents(
              entityTypeBaseUrl,
              newVersion,
            ),
            entityId: recordId.entityId,
            propertyPatches: [],
          },
        },
      });

      if (res.data) {
        onEntityUpdated?.(new Entity(res.data.updateEntity));
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
          LinkComponent={Link}
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
