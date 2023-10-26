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
  useRef,
  useState,
} from "react";
import { useKeys } from "rooks";

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
  const wrapperRef = useRef<HTMLDivElement>(null);

  const { authenticatedUser } = useAuthenticatedUser();

  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const handleFocus = (event: FocusEvent) =>
      setIsFocused(
        !!wrapperRef.current &&
          event.target instanceof Node &&
          wrapperRef.current.contains(event.target),
      );

    const handleBlur = () => setIsFocused(false);

    document.addEventListener("focus", handleFocus, true);
    document.addEventListener("blur", handleBlur, true);

    return () => {
      document.removeEventListener("focus", handleFocus, true);
      document.removeEventListener("blur", handleBlur, true);
    };
  }, []);

  const [creatingNewQuickNote, setCreatingNewQuickNote] = useState(false);

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
          /**
           * These depths are chosen to cover the following:
           * - the blocks (quick note -> [hasLeftEntity incoming 1] contains [hasRightEntity outgoing 1] -> block)
           * - the text block (block -> [hasLeftEntity incoming 2] block data [hasRightEntity outgoing 2] -> text)
           */
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
    setCreatingNewQuickNote(true);
    await createQuickNote();
    await refetchQuickNotes();
    setCreatingNewQuickNote(false);
  }, [createQuickNote, refetchQuickNotes]);

  const handleCommandEnter = useCallback(() => {
    if (isFocused && !creatingNewQuickNote) {
      void handleCreateNew();
    }
  }, [isFocused, handleCreateNew, creatingNewQuickNote]);

  useKeys(["Meta", "Enter"], handleCommandEnter);
  useKeys(["Control", "Enter"], handleCommandEnter);

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
    <Box sx={{ width: "100%" }} onClick={handleClick} ref={wrapperRef}>
      {quickNoteEntityWithCreatedAt && quickNoteSubgraph ? (
        <>
          <EditableQuickNote
            autoFocus
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
              disabled={creatingNewQuickNote}
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
