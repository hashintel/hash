import { faAsterisk, faSearch } from "@fortawesome/free-solid-svg-icons";
import { isBlockEntity } from "@hashintel/hash-shared/entityStore";
import { entityStorePluginState } from "@hashintel/hash-shared/entityStorePlugin";
import {
  Box,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  MenuList,
  Tooltip,
} from "@mui/material";
import { PopupState } from "material-ui-popup-state/core";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  FunctionComponent,
} from "react";
import { BlockEntity, isTextEntity } from "@hashintel/hash-shared/entity";
import {
  LoadingSpinner,
  TextField,
  FontAwesomeIcon,
} from "@hashintel/hash-design-system";
import { useBlockView } from "../BlockViewContext";
import { useRouteAccountInfo } from "../../../shared/routing";
import { MenuItem } from "../../../shared/ui";
import { useAccountEntities } from "../../../components/hooks/useAccountEntities";
import { generateEntityLabel } from "../../../lib/entities";

type LoadEntityMenuContentProps = {
  blockEntityId: string | null;
  closeParentContextMenu: () => void;
  popupState?: PopupState;
};

export const LoadEntityMenuContent: FunctionComponent<
  LoadEntityMenuContentProps
> = ({ blockEntityId, closeParentContextMenu, popupState }) => {
  const { accountId } = useRouteAccountInfo();
  const blockView = useBlockView();

  // This depends on state external to react without subscribing to it
  // and this can cause some bugs.
  // @todo make this a subscription
  const entityStore = entityStorePluginState(blockView.editorView.state).store;

  // savedEntity and blockEntity are the same. savedEntity variable
  // is needed to get proper typing on blockEntity
  const savedEntity = blockEntityId ? entityStore.saved[blockEntityId] : null;
  const blockEntity = isBlockEntity(savedEntity) ? savedEntity : null;

  const searchInputRef = useRef<HTMLInputElement>(null);
  const popupWasOpen = useRef<boolean>(false);

  const { data: entities, loading } = useAccountEntities({
    accountId,
    skip: !(!!blockEntity && !!accountId),
  });

  useEffect(() => {
    if (popupState?.isOpen && !popupWasOpen.current) {
      searchInputRef.current?.focus();
      popupWasOpen.current = true;
    } else if (!popupState?.isOpen) {
      popupWasOpen.current = false;
    }
  }, [popupState]);

  const swapEntity = useCallback(
    (targetEntity: BlockEntity["properties"]["entity"]) => {
      if (!blockEntityId) {
        return;
      }

      blockView.manager.replaceBlockChildEntity(blockEntityId, targetEntity);
    },
    [blockView, blockEntityId],
  );

  const filteredEntities = useMemo(() => {
    const uniqueEntityIds = new Set();
    return entities.filter((entity) => {
      // we are interested in loading different child entities into blocks, not the block entities
      // – block entities are simply a reference to (a) a component and (b) a child entity
      if (isBlockEntity(entity)) return false;

      /**
       * loading text entities does not work, possibly due to use of legacy __linkedData
       * @todo see if this works when __linkedData is removed
       */
      if (
        /** @todo this any type coercion is incorrect, we need to adjust typings https://app.asana.com/0/0/1203099452204542/f */
        isTextEntity(entity as any) ||
        entity.entityType.properties.title === "Page"
      ) {
        return false;
      }

      // don't include entities that have empty data
      if (Object.keys(entity.properties).length === 0) {
        return false;
      }

      const targetEntityId = entity.entityId;

      // don't include the current entity the block is tied to
      if (targetEntityId === blockEntity?.properties.entity.entityId) {
        return false;
      }

      // don't include duplicates
      if (uniqueEntityIds.has(targetEntityId)) {
        return false;
      }

      uniqueEntityIds.add(targetEntityId);

      return true;
    });
  }, [entities, blockEntity]);

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
      {loading ? (
        <Box padding={2}>
          <LoadingSpinner size={16} thickness={4} />
        </Box>
      ) : null}
      {filteredEntities.map((entity) => {
        return (
          <MenuItem
            key={entity.entityId}
            onClick={() => {
              swapEntity(entity);
              closeParentContextMenu();
            }}
          >
            <ListItemIcon>
              <FontAwesomeIcon icon={faAsterisk} />
            </ListItemIcon>
            <Tooltip title={JSON.stringify(entity.properties, undefined, 2)}>
              <ListItemText
                primary={generateEntityLabel(
                  entity,
                  entity.entityType.properties,
                )}
                primaryTypographyProps={{
                  noWrap: true,
                }}
              />
            </Tooltip>
          </MenuItem>
        );
      })}
    </MenuList>
  );
};
