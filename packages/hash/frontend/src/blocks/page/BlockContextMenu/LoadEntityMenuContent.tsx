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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  FunctionComponent,
} from "react";
import { BlockEntity } from "@hashintel/hash-shared/entity";
import { EntityFieldsFragment } from "@hashintel/hash-shared/graphql/apiTypes.gen";
import {
  LoadingSpinner,
  TextField,
  FontAwesomeIcon,
} from "@hashintel/hash-design-system";
import { useBlockView } from "../BlockViewContext";
import { useRouteAccountInfo } from "../../../shared/routing";
import { MenuItem } from "../../../shared/ui";
import { useAccountEntities } from "../../../components/hooks/useAccountEntities";

type LoadEntityMenuContentProps = {
  entityId: string | null;
  popupState?: PopupState;
};

export const LoadEntityMenuContent: FunctionComponent<
  LoadEntityMenuContentProps
> = ({ entityId, popupState }) => {
  const { accountId } = useRouteAccountInfo();
  const blockView = useBlockView();
  // This depends on state external to react without subscribing to it
  // and this can cause some bugs.
  // @todo make this a subscription
  const entityStore = entityStorePluginState(blockView.editorView.state).store;
  // savedEntity and blockEntity are the same. savedEntity variable
  // is needed to get proper typing on blockEntity
  const savedEntity = entityId ? entityStore.saved[entityId] : null;
  const blockEntity = isBlockEntity(savedEntity) ? savedEntity : null;
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { data: entities, loading } = useAccountEntities({
    accountId,
    entityTypeFilter: {
      componentId: blockEntity
        ? blockEntity?.properties.componentId
        : undefined,
    },
    skip: !(!!blockEntity && !!accountId),
  });

  useEffect(() => {
    if (popupState?.isOpen) {
      searchInputRef.current?.focus();
    }
  }, [popupState]);

  const handleClick = useCallback(
    (targetEntity: BlockEntity) => {
      const targetData = targetEntity.properties.entity;

      if (!entityId || !targetData) {
        return;
      }

      blockView.manager.swapBlockData(entityId, targetData, blockView.getPos());
      popupState?.close();
    },
    [blockView, entityId, popupState],
  );

  const filteredEntities = useMemo(() => {
    const uniqueEntityIds = new Set();
    // EntityFieldsFragment has fields BlockEntity doesn't - so TypeScript is complaining about this type guard
    // @todo figure out how to remove this cast
    return (entities as (EntityFieldsFragment | BlockEntity)[]).filter(
      (entity): entity is BlockEntity => {
        // Right now we only handle entities that are created by a block.
        // This will be updated later on to also handle entities that have a similar
        // schema with the block's data
        if (!isBlockEntity(entity)) return false;

        // don't include entities that have empty data
        if (Object.keys(entity.properties.entity.properties).length === 0) {
          return false;
        }

        const targetEntityId = entity.properties.entity.entityId;

        // don't include the current entity the block is tied to
        if (targetEntityId === blockEntity?.properties.entity.entityId) {
          return false;
        }

        // don't include duplicates
        if (uniqueEntityIds.has(targetEntityId)) {
          uniqueEntityIds.add(targetEntityId);
          return false;
        }

        uniqueEntityIds.add(targetEntityId);

        return true;
      },
    );
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
      {filteredEntities.map((entity) => {
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
