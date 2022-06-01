import { faEllipsisVertical } from "@fortawesome/free-solid-svg-icons";
import {
  EntityStore,
  getDraftEntityFromEntityId,
  isBlockEntity,
} from "@hashintel/hash-shared/entityStore";
import { Box } from "@mui/material";
import { JSONObject } from "blockprotocol";
import { bindTrigger } from "material-ui-popup-state";
import { usePopupState } from "material-ui-popup-state/hooks";
import { ForwardRefRenderFunction, useRef, useMemo, forwardRef } from "react";
import { IconButton, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { useUserBlocks } from "../userBlocks";
import { BlockConfigMenu } from "./BlockConfigMenu/BlockConfigMenu";
import { BlockContextMenu } from "./BlockContextMenu/BlockContextMenu";
import { useBlockView } from "./BlockViewContext";
import { BlockSuggesterProps } from "./createSuggester/BlockSuggester";

type BlockHandleProps = {
  deleteBlock: () => void;
  entityId: string | null;
  entityStore: EntityStore;
  onTypeChange: BlockSuggesterProps["onChange"];
  onMouseDown: () => void;
  onClick: () => void;
};

const BlockHandle: ForwardRefRenderFunction<
  HTMLDivElement,
  BlockHandleProps
> = (
  { deleteBlock, entityId, entityStore, onTypeChange, onMouseDown, onClick },
  ref,
) => {
  const blockMenuRef = useRef(null);
  const contextMenuPopupState = usePopupState({
    variant: "popover",
    popupId: "block-context-menu",
  });

  const configMenuPopupState = usePopupState({
    variant: "popover",
    popupId: "block-config-menu",
  });

  const blockSuggesterProps: BlockSuggesterProps = useMemo(
    () => ({
      onChange: (variant, block) => {
        onTypeChange(variant, block);
        contextMenuPopupState.close();
      },
    }),
    [onTypeChange, contextMenuPopupState],
  );

  const { value: blocksMetaMap } = useUserBlocks();

  /**
   * The context and config menu use data from the draft store to subscribe to the latest local changes.
   * Because some blocks update the API directly, bypassing collab and the entity store,
   * data in the menus can get out of sync with data in those blocks for a few seconds.
   * The update is eventually received by collab via the db realtime subscription, and the store updated.
   * This lag will be eliminated when all updates are sent via collab, rather than some via the API.
   * @todo remove this comment when all updates are sent via collab
   */
  const blockEntity = entityId
    ? getDraftEntityFromEntityId(entityStore.draft, entityId) ?? null
    : null;

  if (blockEntity && !isBlockEntity(blockEntity)) {
    throw new Error(`Non-block entity ${entityId} loaded into BlockView.`);
  }

  const blockView = useBlockView();

  const updateChildEntity = (properties: JSONObject) => {
    const childEntity = blockEntity?.properties.entity;
    if (!childEntity) {
      throw new Error(`No child entity on block to update`);
    }
    blockView.manager.updateEntityProperties(childEntity.entityId, properties);
  };

  const blockSchema = blockEntity
    ? blocksMetaMap[blockEntity.properties.componentId]?.componentSchema
    : null;

  return (
    <Box ref={ref} data-testid="block-handle">
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
          onClick?.();
          contextMenuPopupState.open();
        }}
        data-testid="block-changer"
      >
        <FontAwesomeIcon icon={faEllipsisVertical} />
      </IconButton>

      <BlockContextMenu
        blockEntity={blockEntity}
        blockSuggesterProps={blockSuggesterProps}
        deleteBlock={deleteBlock}
        entityId={entityId}
        openConfigMenu={configMenuPopupState.open}
        popupState={contextMenuPopupState}
        ref={blockMenuRef}
      />

      <BlockConfigMenu
        anchorRef={ref}
        blockEntity={blockEntity}
        blockSchema={blockSchema}
        closeMenu={configMenuPopupState.close}
        updateConfig={(properties: JSONObject) => updateChildEntity(properties)}
        popupState={configMenuPopupState}
      />
    </Box>
  );
};

const BlockHandleForwardRef = forwardRef(BlockHandle);

export { BlockHandleForwardRef as BlockHandle };
