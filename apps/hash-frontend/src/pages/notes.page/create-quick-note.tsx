import {
  Entity,
  EntityRootType,
  OwnedById,
  Subgraph,
} from "@local/hash-subgraph";
import { Box, Typography } from "@mui/material";
import { FunctionComponent, useCallback, useMemo, useState } from "react";

import { useBlockProtocolGetEntity } from "../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-get-entity";
import { ArrowTurnDownLeftRegularIcon } from "../../shared/icons/arrow-turn-down-left-regular-icon";
import { Button } from "../../shared/ui";
import { useAuthenticatedUser } from "../shared/auth-info-context";
import { useCreateBlockCollection } from "../shared/use-create-block-collection";
import { EditableQuickNote } from "./editable-quick-note";

export const CreateQuickNote: FunctionComponent = () => {
  const { authenticatedUser } = useAuthenticatedUser();

  const [quickNoteEntity, setQuickNoteEntity] = useState<Entity>();
  const [quickNoteSubgraph, setQuickNoteSubgraph] =
    useState<Subgraph<EntityRootType>>();

  const { createBlockCollectionEntity } = useCreateBlockCollection({
    ownedById: authenticatedUser.accountId as OwnedById,
  });
  const { getEntity } = useBlockProtocolGetEntity();

  const createQuickNote = useCallback(async () => {
    const createdQuickNoteEntity = await createBlockCollectionEntity({
      kind: "quickNote",
    });

    setQuickNoteEntity(createdQuickNoteEntity);

    const { data } = await getEntity({
      data: {
        entityId: createdQuickNoteEntity.metadata.recordId.entityId,
        graphResolveDepths: {
          hasLeftEntity: { incoming: 2, outgoing: 2 },
          hasRightEntity: { incoming: 2, outgoing: 2 },
        },
      },
    });

    setQuickNoteSubgraph(data);
  }, [createBlockCollectionEntity, getEntity]);

  const handleClick = useCallback(async () => {
    if (!quickNoteEntity) {
      await createQuickNote();
    }
  }, [quickNoteEntity, createQuickNote]);

  const handleCreateNew = useCallback(async () => {
    await createQuickNote();
  }, [createQuickNote]);

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
        <Box>
          <Typography>Click here to create a new note...</Typography>
        </Box>
      )}
    </Box>
  );
};
