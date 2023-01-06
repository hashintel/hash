import { faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, TextField } from "@hashintel/hash-design-system";
import { HashBlock } from "@hashintel/hash-shared/blocks";
import {
  Box,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  MenuList,
  Typography,
} from "@mui/material";
import { PopupState } from "material-ui-popup-state/core";
import { FunctionComponent, useEffect, useRef, useState } from "react";

import { MenuItem } from "../../../shared/ui";
import { useBlockView } from "../block-view";
import { useFilteredBlocks } from "../create-suggester/use-filtered-blocks";

type BlockListMenuContentProps = {
  popupState?: PopupState;
  compatibleBlocks: HashBlock[];
};

export const BlockListMenuContent: FunctionComponent<
  BlockListMenuContentProps
> = ({ compatibleBlocks, popupState }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const blocks = useFilteredBlocks(searchQuery, compatibleBlocks);
  const blockView = useBlockView();

  const popupWasOpen = useRef<boolean>(false);

  useEffect(() => {
    if (popupState?.isOpen && !popupWasOpen.current) {
      searchInputRef.current?.focus();
      popupWasOpen.current = true;
    } else if (!popupState?.isOpen) {
      popupWasOpen.current = false;
    }
  }, [popupState]);

  return (
    <MenuList>
      <Box sx={{ mx: 0.75 }}>
        <TextField
          placeholder="Search for blocks"
          fullWidth
          size="xs"
          onChange={(evt) => {
            setSearchQuery(evt.target.value);
          }}
          onKeyDown={(evt) => {
            evt.stopPropagation();
          }}
          value={searchQuery}
          InputProps={{
            inputRef: searchInputRef,
            startAdornment: (
              <InputAdornment position="start">
                <FontAwesomeIcon icon={faSearch} />
              </InputAdornment>
            ),
          }}
        />
      </Box>
      {blocks.length === 0 && (
        <Box px={2.25}>
          <Typography
            variant="smallTextLabels"
            sx={({ palette }) => ({
              color: palette.gray[60],
              fontWeight: 500,
            })}
          >
            No results for `{searchQuery}`
          </Typography>
        </Box>
      )}
      {blocks.map((option) => (
        <MenuItem
          onClick={() => blockView.onBlockChange(option.variant, option.meta)}
          key={`${option.meta.componentId}/${option.variant.name}`}
        >
          <ListItemIcon>
            <Box
              component="img"
              width={16}
              height={16}
              alt={option.variant.name}
              src={option.variant.icon ?? "/format-font.svg"}
            />
          </ListItemIcon>
          <ListItemText primary={option.variant.name} />
        </MenuItem>
      ))}
    </MenuList>
  );
};
