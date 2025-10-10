import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import type { WebId } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { getBlockCollectionTraversalPath } from "@local/hash-isomorphic-utils/block-collection";
import { Box, Skeleton } from "@mui/material";
import type { FunctionComponent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useBlockProtocolGetEntity } from "../../components/hooks/block-protocol-functions/knowledge/use-block-protocol-get-entity";
import { ArrowTurnDownLeftRegularIcon } from "../../shared/icons/arrow-turn-down-left-regular-icon";
import {
  useSetKeyboardShortcuts,
  useUnsetKeyboardShortcuts,
} from "../../shared/keyboard-shortcuts-context";
import { Button } from "../../shared/ui";
import { useAuthenticatedUser } from "../shared/auth-info-context";
import { useCreateBlockCollection } from "../shared/use-create-block-collection";
import { EditableQuickNote } from "./editable-quick-note";

export const CreateQuickNote: FunctionComponent<{
  initialQuickNoteEntity?: HashEntity | null;
  initialQuickNoteEntitySubgraph?: Subgraph<EntityRootType<HashEntity>>;
  refetchQuickNotes: () => Promise<void>;
  onCreatingQuickNote: (quickNoteEntity: HashEntity) => void;
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

  const [quickNoteEntity, setQuickNoteEntity] = useState<HashEntity>();

  const [quickNoteSubgraph, setQuickNoteSubgraph] =
    useState<Subgraph<EntityRootType<HashEntity>>>();

  if (!quickNoteSubgraph && initialQuickNoteEntitySubgraph) {
    setQuickNoteSubgraph(initialQuickNoteEntitySubgraph);
  }

  const { createBlockCollectionEntity } = useCreateBlockCollection({
    webId: authenticatedUser.accountId as WebId,
  });
  const { getEntity } = useBlockProtocolGetEntity();

  const createQuickNote = useCallback(async () => {
    const createdQuickNoteEntity = await createBlockCollectionEntity({
      kind: "note",
    });

    const { data } = await getEntity({
      data: {
        entityId: createdQuickNoteEntity.metadata.recordId.entityId,
        traversalPaths: [
          getBlockCollectionTraversalPath({ blockDataDepth: 1 }),
        ],
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

  const setKeyboardShortcuts = useSetKeyboardShortcuts();
  const unsetKeyboardShortcuts = useUnsetKeyboardShortcuts();

  useEffect(() => {
    const shortcuts = [
      {
        keys: ["Meta", "Enter"],
        callback: handleCommandEnter,
      },
      {
        keys: ["Control", "Enter"],
        callback: handleCommandEnter,
      },
    ];

    setKeyboardShortcuts(shortcuts);

    return () => unsetKeyboardShortcuts(shortcuts);
  }, [handleCommandEnter, setKeyboardShortcuts, unsetKeyboardShortcuts]);

  return (
    <Box sx={{ width: "100%" }} onClick={handleClick} ref={wrapperRef}>
      {quickNoteEntity && quickNoteSubgraph ? (
        <>
          <EditableQuickNote
            autoFocus
            displayActionButtons={false}
            quickNoteEntity={quickNoteEntity}
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
