import { faAsterisk, faSearch } from "@fortawesome/free-solid-svg-icons";
import { isBlockEntity } from "@hashintel/hash-shared/entityStore";
import { entityStorePluginState } from "@hashintel/hash-shared/entityStorePlugin";
import {
  Box,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  MenuItem,
  MenuList,
} from "@mui/material";
import { PopupState } from "material-ui-popup-state/core";
import { useCallback, useEffect, useMemo, useRef, VFC } from "react";
import { BlockEntity } from "@hashintel/hash-shared/entity";
import { useBlockView } from "../BlockViewContext";
import { FontAwesomeIcon } from "../../../shared/icons";
import { useRouteAccountInfo } from "../../../shared/routing";
import { LoadingSpinner, TextField } from "../../../shared/ui";
import { useAccountEntities } from "../../../components/hooks/useAccountEntities";

type LoadEntityMenuContentProps = {
  entityId: string | null;
  popupState?: PopupState;
};

export const LoadEntityMenuContent: VFC<LoadEntityMenuContentProps> = ({
  entityId,
  popupState,
}) => {
  const { accountId } = useRouteAccountInfo();
  const blockView = useBlockView();
  // This depends on state external to react without subscribing to it
  // and this can cause some bugs.
  // @todo make this a subscription
  const entityStore = entityStorePluginState(blockView.editorView.state).store;
  const blockData = entityId ? entityStore.saved[entityId] : null;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { data: entities, loading } = useAccountEntities({
    accountId,
    entityTypeFilter: {
      componentId: isBlockEntity(blockData)
        ? blockData?.properties.componentId
        : undefined,
    },
    skip: !(isBlockEntity(blockData) && !!accountId),
  });

  useEffect(() => {
    if (popupState?.isOpen) {
      searchInputRef.current?.focus();
    }
  }, [popupState]);

  const handleClick = useCallback(
    (targetEntity: BlockEntity) => {
      // Right now we only handle entities that are created by a block.
      // This will be updated later on to also handle entities that have a similar
      // schema with the block's data
      const targetData = isBlockEntity(targetEntity)
        ? targetEntity.properties.entity
        : null;

      if (!entityId || !targetData) {
        return;
      }

      blockView.manager.updateBlockData(
        entityId,
        targetData,
        blockView.getPos(),
      );
      popupState?.close();
    },
    [blockView, entityId, popupState],
  );

  const filteredEntities = useMemo(() => {
    const uniqueEntityIds = new Set();
    return entities.filter((entity) => {
      if (Object.keys(entity.properties?.entity?.properties).length === 0) {
        return false;
      }

      const targetEntityId = entity.properties?.entity.entityId;

      // if the target entity is the same as the current one the block is linked to
      // return
      if (targetEntityId === blockData?.properties.entity.entityId) {
        return false;
      }

      const isDuplicate = uniqueEntityIds.has(targetEntityId);

      uniqueEntityIds.add(targetEntityId);

      // We could have 2 block entities linked to the same entity
      // this ensures the entity doesn't appear twice
      if (isDuplicate) {
        return false;
      }

      return true;
    });
  }, [entities, blockData]);

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
      {filteredEntities.map((entity) => {
        return (
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore -- @todo fix typings
          <MenuItem key={entity.entityId} onClick={() => handleClick(entity)}>
            <ListItemIcon>
              <FontAwesomeIcon icon={faAsterisk} />
            </ListItemIcon>
            <ListItemText
              // eslint-disable-next-line @typescript-eslint/ban-ts-comment
              // @ts-ignore -- @todo fix typings
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
