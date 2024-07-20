import { bindTrigger } from "material-ui-popup-state";
import { usePopupState } from "material-ui-popup-state/hooks";
import type { forwardRef, ForwardRefRenderFunction } from "react";
import type { JsonObject } from "@blockprotocol/core";
import { faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/design-system";
import type {
  EntityStore,
  isBlockEntity,
} from "@local/hash-isomorphic-utils/entity-store";
import { Box } from "@mui/material";

import { BlockConfigMenu } from "./block-config-menu/block-config-menu";
import { useBlockContext } from "./block-context";
import { BlockContextMenu } from "./block-context-menu/block-context-menu";
import { useBlockView } from "./block-view";

interface BlockHandleProps {
  deleteBlock: () => void;
  draftId: string | null;
  entityStore: EntityStore;
  onMouseDown: () => void;
  onClick: () => void;
}

const BlockHandle: ForwardRefRenderFunction<
  HTMLDivElement,
  BlockHandleProps
> = ({ deleteBlock, draftId, entityStore, onMouseDown, onClick }, ref) => {
  const contextMenuPopupState = usePopupState({
    variant: "popover",
    popupId: "block-context-menu",
  });

  const configMenuPopupState = usePopupState({
    variant: "popover",
    popupId: "block-config-menu",
  });

  /**
   * The context and config menu use data from the draft store to subscribe to the latest local changes.
   * Because some blocks update the API directly, bypassing collab and the entity store,
   * data in the menus can get out of sync with data in those blocks for a few seconds.
   * The update is eventually received by collab via the db realtime subscription, and the store updated.
   * This lag will be eliminated when all updates are sent via collab, rather than some via the API.
   *
   * @todo Remove this comment when all updates are sent via collab.
   */
  const blockEntity = draftId ? (entityStore.draft[draftId] ?? null) : null;

  if (blockEntity && !isBlockEntity(blockEntity)) {
    throw new Error(`Non-block entity ${draftId} loaded into BlockView.`);
  }

  const blockView = useBlockView();

  const updateChildEntity = (properties: JsonObject) => {
    /**
     *  @see https://linear.app/hash/issue/H-3000
     *  @todo Properly type this part of the DraftEntity type.
     */
    const childEntity = blockEntity?.blockChildEntity;

    if (!childEntity) {
      throw new Error(`No child entity on block to update`);
    }
    blockView.manager.updateEntityProperties(
      childEntity.metadata.recordId.entityId,
      properties,
    );
  };

  const blockContext = useBlockContext();

  if (blockView.readonly) {
    return null;
  }

  return (
    <Box
      ref={ref}
      data-testid={"block-handle"}
      sx={(theme) => ({
        opacity: blockView.hovered || contextMenuPopupState.isOpen ? 1 : 0,
        transition: theme.transitions.create("opacity"),
      })}
    >
      <IconButton
        unpadded
        ref={(element) => {
          if (element && !contextMenuPopupState.setAnchorElUsed) {
            contextMenuPopupState.setAnchorEl(element);
          }
        }}
        onMouseDown={onMouseDown}
        {...bindTrigger(contextMenuPopupState)}
        data-testid={"block-changer"}
        onClick={() => {
          onClick();
          contextMenuPopupState.open();
        }}
      >
        <FontAwesomeIcon icon={faEllipsisVertical} />
      </IconButton>

      <BlockContextMenu
        blockEntity={blockEntity}
        deleteBlock={deleteBlock}
        openConfigMenu={configMenuPopupState.open}
        popupState={contextMenuPopupState}
        canSwap={!blockContext.error}
      />

      <BlockConfigMenu
        anchorRef={ref}
        blockEntity={blockEntity}
        closeMenu={configMenuPopupState.close}
        updateConfig={(properties: JsonObject) => {
          updateChildEntity(properties);
        }}
        popupState={configMenuPopupState}
      />
    </Box>
  );
};

const BlockHandleForwardRef = forwardRef(BlockHandle);

export { BlockHandleForwardRef as BlockHandle };
