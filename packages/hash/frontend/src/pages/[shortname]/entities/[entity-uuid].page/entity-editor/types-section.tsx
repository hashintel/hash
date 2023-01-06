import { extractBaseUri, extractVersion } from "@blockprotocol/type-system";
import { Button } from "@hashintel/hash-design-system";
import { EntityId } from "@hashintel/hash-shared/types";
import { versionedUriFromComponents } from "@hashintel/hash-subgraph/src/shared/type-system-patch";
import { getEntityTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/entity-type";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
} from "@mui/material";
import { useEffect, useState } from "react";

import { useBlockProtocolUpdateEntity } from "../../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-update-entity";
import { useBlockProtocolAggregateEntityTypes } from "../../../../../components/hooks/block-protocol-functions/ontology/use-block-protocol-aggregate-entity-types";
import { SectionWrapper } from "../../../shared/section-wrapper";
import { useEntityEditor } from "./entity-editor-context";
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
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
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
      setUpdateDialogOpen(false);
      setUpdatingVersion(false);
    }
  };

  const handleCloseDialog = () => setUpdateDialogOpen(false);
  const handleOpenDialog = () => setUpdateDialogOpen(true);

  return (
    <SectionWrapper
      title="Types"
      titleTooltip="Types describe what an entity is, allowing information to be associated with it. Entities can have an unlimited number of types."
    >
      <Box display="flex" gap={2}>
        <TypeCard
          url={entityTypeUrl}
          title={entityTypeTitle}
          version={extractVersion(entityTypeId)}
          newVersionConfig={
            newVersion
              ? {
                  newVersion,
                  onUpdateVersion: handleOpenDialog,
                }
              : undefined
          }
        />
      </Box>

      <Dialog open={updateDialogOpen} onClose={handleCloseDialog}>
        <DialogTitle>Updating version</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This action could be destructive. Please make sure you know what
            you're doing.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button variant="tertiary_quiet" onClick={handleCloseDialog}>
            Cancel
          </Button>
          <Button
            variant="tertiary_quiet"
            onClick={handleUpdateVersion}
            loading={updatingVersion}
            loadingWithoutText
          >
            Update
          </Button>
        </DialogActions>
      </Dialog>
    </SectionWrapper>
  );
};
