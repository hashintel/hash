import type { JsonObject } from "@blockprotocol/core";
import { faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/design-system";
import type { EntityStore } from "@local/hash-isomorphic-utils/entity-store";
import { isBlockEntity } from "@local/hash-isomorphic-utils/entity-store";
import { Box } from "@mui/material";
import { bindTrigger } from "material-ui-popup-state";
import { usePopupState } from "material-ui-popup-state/hooks";
import type { ForwardRefRenderFunction } from "react";
import { forwardRef } from "react";

import { BlockConfigMenu } from "./block-config-menu/block-config-menu";
import { useBlockContext } from "./block-context";
import { BlockContextMenu } from "./block-context-menu/block-context-menu";
import { useBlockView } from "./block-view";

type BlockHandleProps = {
  deleteBlock: () => void;
  draftId: string | null;
  entityStore: EntityStore;
  onMouseDown: () => void;
  onClick: () => void;
};

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
   * @todo remove this comment when all updates are sent via collab
   */
  const blockEntity = draftId ? (entityStore.draft[draftId] ?? null) : null;

  if (blockEntity && !isBlockEntity(blockEntity)) {
    throw new Error(`Non-block entity ${draftId} loaded into BlockView.`);
  }

  const blockView = useBlockView();

  const updateChildEntity = (properties: JsonObject) => {
    /**
     *  @todo properly type this part of the DraftEntity type
     *  @see https://linear.app/hash/issue/H-3000
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
      sx={(theme) => ({
        opacity: blockView.hovered || contextMenuPopupState.isOpen ? 1 : 0,
        transition: theme.transitions.create("opacity"),
      })}
      data-testid="block-handle"
    >
      <IconButton
        ref={(el) => {
          if (el && !contextMenuPopupState.setAnchorElUsed) {
            contextMenuPopupState.setAnchorEl(el);
          }
        }}
        onMouseDown={onMouseDown}
        unpadded
        {...bindTrigger(contextMenuPopupState)}
        onClick={() => {
          onClick();
          contextMenuPopupState.open();
        }}
        data-testid="block-changer"
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
        updateConfig={(properties: JsonObject) => updateChildEntity(properties)}
        popupState={configMenuPopupState}
      />
    </Box>
  );
};

const BlockHandleForwardRef = forwardRef(BlockHandle);

export { BlockHandleForwardRef as BlockHandle };
