import { faAsterisk, faSearch } from "@fortawesome/free-solid-svg-icons";
import { BlockEntity } from "@hashintel/hash-shared/entity";
import { isBlockEntity } from "@hashintel/hash-shared/entityStore";
import {
  addEntityStoreAction,
  entityStorePluginStateFromTransaction,
} from "@hashintel/hash-shared/entityStorePlugin";
import {
  Box,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  MenuItem,
  MenuList,
} from "@mui/material";
import { PopupState } from "material-ui-popup-state/core";
import { useCallback, useEffect, useRef, VFC } from "react";
import { useBlockView } from "../../blocks/page/BlockViewContext";
import { FontAwesomeIcon } from "../../shared/icons";
import { useRouteAccountInfo } from "../../shared/routing";
import { LoadingSpinner, TextField } from "../../shared/ui";
import { useAccountEntities } from "../hooks/useAccountEntities";

type LoadEntityMenuContentProps = {
  entityId: string | null;
  popupState?: PopupState;
};

export const LoadEntityMenuContent: VFC<LoadEntityMenuContentProps> = ({
  entityId,
  popupState,
}) => {
  const { accountId } = useRouteAccountInfo();
  const { data: entities, fetchEntities, loading } = useAccountEntities();
  const blockView = useBlockView();
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (popupState?.isOpen) {
      searchInputRef.current?.focus();
    }
  }, [popupState]);

  useEffect(() => {
    const entityStore = entityStorePluginStateFromTransaction(
      blockView.view.state.tr,
      blockView.view.state,
    ).store;
    const blockData = entityId ? entityStore.saved[entityId] : null;

    if (isBlockEntity(blockData) && accountId) {
      void fetchEntities(accountId, {
        componentId: blockData.properties.componentId,
      });
    }
  }, [blockView, entityId, accountId, fetchEntities]);

  const handleClick = useCallback(
    (targetData: BlockEntity) => {
      let currentEntityStore = entityStorePluginStateFromTransaction(
        blockView.view.state.tr,
        blockView.view.state,
      ).store;
      const blockData = entityId ? currentEntityStore.saved[entityId] : null;

      const targetEntity = isBlockEntity(targetData)
        ? targetData.properties.entity
        : null;
      const blockEntity = isBlockEntity(blockData)
        ? blockData.properties.entity
        : null;

      if (
        !targetEntity ||
        !blockData ||
        !blockEntity ||
        targetEntity.entityId === blockEntity.entityId
      ) {
        return;
      }

      const tr = blockView.view.state.tr;

      addEntityStoreAction(blockView.view.state, tr, {
        type: "updateBlockEntityProperties",
        payload: {
          targetEntity,
          draftId: `draft-${blockData.entityId}`,
        },
      });

      currentEntityStore = entityStorePluginStateFromTransaction(
        tr,
        blockView.view.state,
      ).store;

      const pos = blockView.getPos();

      const node = blockView.manager.createLocalBlock(
        blockData?.properties.componentId,
        currentEntityStore,
        `draft-${blockData.entityId}`,
      );

      tr.replaceRangeWith(pos, pos + node.nodeSize, node);
      blockView.view.dispatch(tr);
      popupState?.close();
    },
    [blockView, entityId, popupState],
  );

  // @todo filter entities displayed
  // should only include block entities and
  // should not include current entity displayed in the block

  return (
    <MenuList>
      <Box sx={{ mx: 0.75 }}>
        <TextField
          placeholder="Search for entities"
          fullWidth
          size="xs"
          onKeyDown={(evt) => {
            evt.stopPropagation();
          }}
          InputProps={{
            inputRef: searchInputRef,
            startAdornment: (
              <InputAdornment position="start">
                <FontAwesomeIcon icon={faSearch} />
              </InputAdornment>
            ),
            endAdornment: loading ? (
              <InputAdornment
                position="start"
                sx={{ visibility: loading ? "visible" : "hidden" }}
              >
                <LoadingSpinner size={12} thickness={4} />
              </InputAdornment>
            ) : null,
          }}
        />
      </Box>
      {entities.map((entity) => {
        return (
          <MenuItem key={entity.entityId} onClick={() => handleClick(entity)}>
            <ListItemIcon>
              <FontAwesomeIcon icon={faAsterisk} />
            </ListItemIcon>
            <ListItemText
              primary={entity.properties.entity.entityId}
              primaryTypographyProps={{
                noWrap: true,
              }}
            />
          </MenuItem>
        );
      })}
    </MenuList>
  );
};
