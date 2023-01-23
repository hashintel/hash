import { Button } from "@local/design-system";
import { EntityId } from "@local/hash-isomorphic-utils/types";
import { Subgraph, SubgraphRootTypes } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/src/stdlib/roots";
import { Drawer, Stack, Typography } from "@mui/material";
import { useState } from "react";

import { useBlockProtocolUpdateEntity } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-update-entity";
import { EntityEditor } from "./entity-editor";
import { updateEntitySubgraphStateByEntity } from "./shared/update-entity-subgraph-state-by-entity";
import { useApplyDraftLinkEntityChanges } from "./shared/use-apply-draft-link-entity-changes";
import { useDraftLinkState } from "./shared/use-draft-link-state";

interface EditEntityModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  entitySubgraph: Subgraph<SubgraphRootTypes["entity"]>;
}

export const EditEntityModal = ({
  open,
  onClose,
  onSubmit,
  entitySubgraph,
}: EditEntityModalProps) => {
  const [draftEntitySubgraph, setDraftEntitySubgraph] = useState<
    Subgraph<SubgraphRootTypes["entity"]> | undefined
  >(entitySubgraph);
  const [savingChanges, setSavingChanges] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [prevOpen, setPrevOpen] = useState(open);

  if (prevOpen !== open) {
    setPrevOpen(open);

    // reset state before opening modal
    if (open) {
      setSavingChanges(false);
      setIsDirty(false);
      setDraftEntitySubgraph(entitySubgraph);
    }
  }

  const [
    draftLinksToCreate,
    setDraftLinksToCreate,
    draftLinksToArchive,
    setDraftLinksToArchive,
  ] = useDraftLinkState();
  const applyDraftLinkEntityChanges = useApplyDraftLinkEntityChanges();
  const { updateEntity } = useBlockProtocolUpdateEntity();

  if (!draftEntitySubgraph) {
    return null;
  }

  const handleSaveChanges = async () => {
    const draftEntity = getRoots(draftEntitySubgraph)[0];

    if (!draftEntity) {
      return;
    }

    try {
      setSavingChanges(true);

      await applyDraftLinkEntityChanges(
        draftEntity.metadata.editionId.baseId as EntityId,
        draftLinksToCreate,
        draftLinksToArchive,
      );

      /** @todo add validation here */
      const updateEntityResponse = await updateEntity({
        data: {
          entityId: draftEntity.metadata.editionId.baseId as EntityId,
          properties: draftEntity.properties,
          entityTypeId: draftEntity.metadata.entityTypeId,
        },
      });

      if (!updateEntityResponse.data) {
        throw new Error("Updating entity failed");
      }

      onSubmit();
    } catch (err) {
      setSavingChanges(false);
    }
  };

  const submitDisabled =
    !isDirty && !draftLinksToCreate.length && !draftLinksToArchive.length;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      anchor="right"
      PaperProps={{
        sx: (theme) => ({
          p: 5,
          gap: 6.5,
          maxWidth: 1200,
          width: "calc(100vw - 200px)",
          [theme.breakpoints.down("md")]: {
            width: "100%",
          },
        }),
      }}
    >
      <Typography variant="h2" color="gray.90" fontWeight="bold">
        Edit Entity
      </Typography>

      <EntityEditor
        refetch={async () => {}}
        entitySubgraph={draftEntitySubgraph}
        setEntity={(entity) => {
          setIsDirty(true);
          updateEntitySubgraphStateByEntity(entity, setDraftEntitySubgraph);
        }}
        draftLinksToCreate={draftLinksToCreate}
        setDraftLinksToCreate={setDraftLinksToCreate}
        draftLinksToArchive={draftLinksToArchive}
        setDraftLinksToArchive={setDraftLinksToArchive}
      />

      <Stack direction="row" gap={3}>
        <Button
          onClick={handleSaveChanges}
          loading={savingChanges}
          disabled={submitDisabled}
        >
          Save Changes
        </Button>
        <Button onClick={onClose} variant="tertiary">
          Cancel
        </Button>
      </Stack>
    </Drawer>
  );
};
