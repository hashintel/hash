import { faSearch } from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  InputAdornment,
  ListItemIcon,
  ListItemText,
  MenuItem,
  MenuList,
  Typography,
} from "@mui/material";
import { PopupState } from "material-ui-popup-state/core";
import { useRef, useState, VFC } from "react";
import { BlockSuggesterProps } from "../createSuggester/BlockSuggester";
import { useFilteredBlocks } from "../createSuggester/useFilteredBlocks";
import { useUserBlocks } from "../../userBlocks";
import { FontAwesomeIcon } from "../../../shared/icons";
import { TextField } from "../../../shared/ui";

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

  // The essence of this is to autoFocus the input when
  // the blocklist menu comes up. We have a listener for
  // character "/". Once that is clicked the MenuItem that has this submenu
  // is focused and as a result the submenu becomes visible.
  // Currently this flow introduces a bug where it is difficult to switch to certain blocks
  // e.g Embed;
  // @see https://github.com/hashintel/hash/pull/480#discussion_r849594184
  // Commenting this out till a fix is made
  // useEffect(() => {
  // if (popupState?.isOpen) {
  //   searchInputRef.current?.focus();
  // }
  // }, [popupState]);

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
            popupState?.close();
          }}
          key={`${option.meta.name}/${option.variant.name}`}
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
          <ListItemText primary={option?.variant.name} />
        </MenuItem>
      ))}
    </MenuList>
  );
};
