import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import { Drawer, Stack, Typography } from "@mui/material";
import { useCallback, useMemo, useState } from "react";

import { useBlockProtocolUpdateEntity } from "../../../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-update-entity";
import { Button } from "../../../../shared/ui";
import { EntityEditor } from "./entity-editor";
import { updateEntitySubgraphStateByEntity } from "./shared/update-entity-subgraph-state-by-entity";
import { useApplyDraftLinkEntityChanges } from "./shared/use-apply-draft-link-entity-changes";
import { useDraftLinkState } from "./shared/use-draft-link-state";

interface EditEntityModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  entitySubgraph: Subgraph<EntityRootType>;
}

export const EditEntityModal = ({
  open,
  onClose,
  onSubmit,
  entitySubgraph,
}: EditEntityModalProps) => {
  const [localEntitySubgraph, setLocalEntitySubgraph] =
    useState<Subgraph<EntityRootType>>(entitySubgraph);

  const [savingChanges, setSavingChanges] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [prevOpen, setPrevOpen] = useState(open);

  if (prevOpen !== open) {
    setPrevOpen(open);

    // reset state before opening modal
    if (open) {
      setSavingChanges(false);
      setIsDirty(false);
      setLocalEntitySubgraph(entitySubgraph);
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

  const entityLabel = useMemo(
    () => generateEntityLabel(localEntitySubgraph),
    [localEntitySubgraph],
  );

  const resetEntityEditor = useCallback(() => {
    setDraftLinksToCreate([]);
    setDraftLinksToArchive([]);
    setIsDirty(false);
  }, [setDraftLinksToCreate, setDraftLinksToArchive, setIsDirty]);

  const handleCancel = useCallback(() => {
    resetEntityEditor();
    onClose();
  }, [onClose, resetEntityEditor]);

  const handleSaveChanges = useCallback(async () => {
    const draftEntity = getRoots(localEntitySubgraph)[0];

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
        data: {
          entityId: draftEntity.metadata.recordId.entityId,
          properties: draftEntity.properties,
          entityTypeId: draftEntity.metadata.entityTypeId,
        },
      });

      if (!updateEntityResponse.data) {
        throw new Error("Updating entity failed");
      }

      resetEntityEditor();
      onSubmit();
    } catch (err) {
      setSavingChanges(false);
    }
  }, [
    applyDraftLinkEntityChanges,
    draftLinksToArchive,
    draftLinksToCreate,
    localEntitySubgraph,
    onSubmit,
    resetEntityEditor,
    updateEntity,
  ]);

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
        {entityLabel}
      </Typography>

      <EntityEditor
        readonly={false}
        onEntityUpdated={null}
        entitySubgraph={localEntitySubgraph}
        setEntity={(entity) => {
          setIsDirty(true);
          updateEntitySubgraphStateByEntity(
            entity,
            (updatedEntitySubgraphOrFunction) => {
              setLocalEntitySubgraph((prev) => {
                const updatedEntitySubgraph =
                  typeof updatedEntitySubgraphOrFunction === "function"
                    ? updatedEntitySubgraphOrFunction(prev)
                    : updatedEntitySubgraphOrFunction;

                return updatedEntitySubgraph ?? prev;
              });
            },
          );
        }}
        isDirty={isDirty}
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
        <Button onClick={handleCancel} variant="tertiary">
          Cancel
        </Button>
      </Stack>
    </Drawer>
  );
};
