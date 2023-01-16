import { faAsterisk, faSearch } from "@fortawesome/free-solid-svg-icons";
import { EntityId } from "@hashintel/hash-subgraph";
import {
  FontAwesomeIcon,
  LoadingSpinner,
  TextField,
} from "@local/design-system";
import { BlockEntity } from "@local/hash-isomorphic-utils/entity";
import { EntityStoreType } from "@local/hash-isomorphic-utils/entity-store";
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
  FunctionComponent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";

import { generateEntityLabel } from "../../../lib/entities";
import { MenuItem } from "../../../shared/ui";
import { useBlockView } from "../block-view";

type LoadEntityMenuContentProps = {
  blockEntityId: EntityId | null;
  closeParentContextMenu: () => void;
  popupState?: PopupState;
};

export const LoadEntityMenuContent: FunctionComponent<
  LoadEntityMenuContentProps
> = ({ blockEntityId, closeParentContextMenu, popupState }) => {
  const blockView = useBlockView();
  const loading: boolean = true;

  // This depends on state external to react without subscribing to it
  // and this can cause some bugs.
  // @todo make this a subscription
  // const entityStore = entityStorePluginState(blockView.editorView.state).store;

  // savedEntity and blockEntity are the same. savedEntity variable
  // is needed to get proper typing on blockEntity
  // const savedEntity = blockEntityId ? entityStore.saved[blockEntityId] : null;
  // const blockEntity = isBlockEntity(savedEntity) ? savedEntity : null;

  const searchInputRef = useRef<HTMLInputElement>(null);
  const popupWasOpen = useRef<boolean>(false);

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
      /** @todo properly type this part of the DraftEntity type https://app.asana.com/0/0/1203099452204542/f */
      blockView.manager.replaceBlockChildEntity(
        blockEntityId,
        targetEntity as unknown as EntityStoreType,
      );
    },
    [blockView, blockEntityId],
  );

  // TODO: get actual entities.
  const filteredEntities = useMemo(() => [], []);

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
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment
            endAdornment: loading ? (
              <InputAdornment position="start">
                <LoadingSpinner size={12} thickness={4} />
              </InputAdornment>
            ) : null,
          }}
        />
      </Box>
      {/* eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- @todo improve logic or types to remove this comment */}
      {loading ? (
        <Box padding={2}>
          <LoadingSpinner size={16} thickness={4} />
        </Box>
      ) : null}
      {filteredEntities.map((entity) => {
        return (
          <MenuItem
            key={(entity as any).entityId}
            onClick={() => {
              swapEntity(entity);
              closeParentContextMenu();
            }}
          >
            <ListItemIcon>
              <FontAwesomeIcon icon={faAsterisk} />
            </ListItemIcon>
            <Tooltip
              title={JSON.stringify((entity as any).properties, undefined, 2)}
            >
              <ListItemText
                primary={generateEntityLabel(entity)}
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
