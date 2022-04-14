import { faSearch } from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  MenuItem,
  MenuList,
  TextField,
  Typography,
} from "@mui/material";
import { PopupState } from "material-ui-popup-state/core";
import { useEffect, useRef, useState, VFC } from "react";
import {
  BlockSuggesterProps
} from "../createSuggester/BlockSuggester";
import { useFilteredBlocks } from "../createSuggester/useFilteredBlocks";
import { useUserBlocks } from "../../userBlocks";
import { FontAwesomeIcon } from "../../../shared/icons";

type BlockListMenuContentProps = {
  popupState?: PopupState;
  blockSuggesterProps: BlockSuggesterProps;
};

export const BlockListMenuContent: VFC<BlockListMenuContentProps> = ({
  blockSuggesterProps,
  popupState,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const { value: userBlocks } = useUserBlocks();
  const blocks = useFilteredBlocks(searchQuery, userBlocks);

  useEffect(() => {
    if (popupState?.isOpen) {
      searchInputRef.current?.focus();
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
          onClick={() => {
            blockSuggesterProps.onChange(option.variant, option.meta);
          }}
          key={`${option.meta.name}/${option.variant.name}`}
        >
          <ListItemIcon>
            <Box
              component="img"
              width={16}
              height={16}
              overflow="hidden"
              alt={option.variant.name}
              src={option.variant.icon ?? "/format-font.svg"}
            />
          </ListItemIcon>
          <ListItemText primary={option?.variant.name} />
        </MenuItem>
      ))}
    </MenuList>
  );
};
