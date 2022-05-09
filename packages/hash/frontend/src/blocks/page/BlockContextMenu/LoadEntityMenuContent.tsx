import { faAsterisk, faSearch } from "@fortawesome/free-solid-svg-icons";
import { isBlockEntity } from "@hashintel/hash-shared/entityStore";
import { entityStorePluginState } from "@hashintel/hash-shared/entityStorePlugin";
import {
  Box,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  MenuList,
} from "@mui/material";
import { PopupState } from "material-ui-popup-state/core";
import { useCallback, useEffect, useRef, VFC } from "react";
import { BlockEntity } from "@hashintel/hash-shared/entity";
import { useBlockView } from "../BlockViewContext";
import { FontAwesomeIcon } from "../../../shared/icons";
import { useRouteAccountInfo } from "../../../shared/routing";
import { LoadingSpinner, TextField, MenuItem } from "../../../shared/ui";
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
