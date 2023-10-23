import {
  Entity,
  EntityRootType,
  OwnedById,
  Subgraph,
} from "@local/hash-subgraph";
import { Box, Skeleton } from "@mui/material";
import {
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useBlockProtocolGetEntity } from "../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-get-entity";
import { ArrowTurnDownLeftRegularIcon } from "../../shared/icons/arrow-turn-down-left-regular-icon";
import { Button } from "../../shared/ui";
import { useAuthenticatedUser } from "../shared/auth-info-context";
import { useCreateBlockCollection } from "../shared/use-create-block-collection";
import { EditableQuickNote } from "./editable-quick-note";

export const CreateQuickNote: FunctionComponent<{
  initialQuickNoteEntity?: Entity | null;
  initialQuickNoteEntitySubgraph?: Subgraph<EntityRootType>;
  refetchQuickNotes: () => Promise<void>;
  onCreatingQuickNote: (quickNoteEntity: Entity) => void;
}> = ({
  initialQuickNoteEntity,
  initialQuickNoteEntitySubgraph,
  onCreatingQuickNote,
  refetchQuickNotes,
}) => {
  const { authenticatedUser } = useAuthenticatedUser();

  const [quickNoteEntity, setQuickNoteEntity] = useState<Entity>();

  const [quickNoteSubgraph, setQuickNoteSubgraph] =
    useState<Subgraph<EntityRootType>>();

  if (!quickNoteSubgraph && initialQuickNoteEntitySubgraph) {
    setQuickNoteSubgraph(initialQuickNoteEntitySubgraph);
  }

  const { createBlockCollectionEntity } = useCreateBlockCollection({
    ownedById: authenticatedUser.accountId as OwnedById,
  });
  const { getEntity } = useBlockProtocolGetEntity();

  const createQuickNote = useCallback(async () => {
    const createdQuickNoteEntity = await createBlockCollectionEntity({
      kind: "quickNote",
    });

    const { data } = await getEntity({
      data: {
        entityId: createdQuickNoteEntity.metadata.recordId.entityId,
        graphResolveDepths: {
          hasLeftEntity: { incoming: 2, outgoing: 2 },
          hasRightEntity: { incoming: 2, outgoing: 2 },
        },
      },
    });

    onCreatingQuickNote(createdQuickNoteEntity);
    setQuickNoteEntity(createdQuickNoteEntity);
    setQuickNoteSubgraph(data);
  }, [onCreatingQuickNote, createBlockCollectionEntity, getEntity]);

  useEffect(() => {
    if (!quickNoteEntity) {
      if (initialQuickNoteEntity) {
        setQuickNoteEntity(initialQuickNoteEntity);
      } else if (initialQuickNoteEntity === null) {
        void createQuickNote();
      }
    }
  }, [initialQuickNoteEntity, createQuickNote, quickNoteEntity]);

  const handleClick = useCallback(async () => {
    if (!quickNoteEntity) {
      await createQuickNote();
    }
  }, [quickNoteEntity, createQuickNote]);

  const handleCreateNew = useCallback(async () => {
    await createQuickNote();
    await refetchQuickNotes();
  }, [createQuickNote, refetchQuickNotes]);

  const quickNoteEntityWithCreatedAt = useMemo(
    () =>
      quickNoteEntity
        ? {
            quickNoteEntity,
            createdAt: new Date(
              quickNoteEntity.metadata.temporalVersioning.decisionTime.start.limit,
            ),
          }
        : undefined,
    [quickNoteEntity],
  );

  return (
    <Box sx={{ width: "100%" }} onClick={handleClick}>
      {quickNoteEntityWithCreatedAt && quickNoteSubgraph ? (
        <>
          <EditableQuickNote
            displayActionButtons={false}
            quickNoteEntityWithCreatedAt={quickNoteEntityWithCreatedAt}
            quickNoteSubgraph={quickNoteSubgraph}
          />
          <Box
            display="flex"
            justifyContent="flex-end"
            marginBottom={1}
            onClick={handleCreateNew}
          >
            <Button
              variant="tertiary_quiet"
              size="xs"
              endIcon={<ArrowTurnDownLeftRegularIcon />}
            >
              Create
            </Button>
          </Box>
        </>
      ) : (
        <Skeleton />
      )}
    </Box>
  );
};
