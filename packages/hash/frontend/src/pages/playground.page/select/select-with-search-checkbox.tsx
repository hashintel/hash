import { faEye, faEyeSlash } from "@fortawesome/free-regular-svg-icons";
import {
  Box,
  Checkbox,
  Divider,
  FormControl,
  InputLabel,
  ListItemIcon,
  ListItemText,
  Select,
} from "@mui/material";
import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "../../../shared/icons";
import { Button, Chip, TextField, MenuItem } from "../../../shared/ui";

const MENU_ITEMS = [
  "Edit",
  "Add to Favorites",
  "Duplicate",
  "Copy Link",
  "Move",
  "Rename",
  "Filter",
];

export const SelectWithSearchAndCheckbox = () => {
  const [query, setQuery] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<string[]>(["Edit"]);

  const filteredMenuItems = useMemo(() => {
    return MENU_ITEMS.filter((item) =>
      item.toLowerCase().includes(query.toLowerCase()),
    );
  }, [query]);

  const toggleItem = (item: string) => {
    if (selectedOptions.includes(item)) {
      setSelectedOptions((prev) => prev.filter((option) => option !== item));
    } else {
      setSelectedOptions((prev) => [...prev, item]);
    }
  };

  return (
    <FormControl>
      <InputLabel
        sx={{ visibility: "visible", color: "red" }}
        shrink={false}
        disableAnimation
        variant="standard"
      />
      <Select
        multiple
        fullWidth
        renderValue={(selected) => (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {selected.map((value) => (
              <Chip key={value} label={value} size="xs" color="blue" />
            ))}
          </Box>
        )}
        value={selectedOptions}
      >
        <Box component="li" sx={{ px: 0.25 }}>
          <TextField
            fullWidth
            size="xs"
            placeholder="Search for Companies"
            value={query}
            onChange={(evt) => setQuery(evt.target.value)}
            onKeyDown={(evt) => {
              evt.stopPropagation();
            }}
            sx={{ mx: 0.25 }}
          />
        </Box>
        {filteredMenuItems.map((item) => (
          <MenuItem
            key={item}
            value={item}
            onClick={() => toggleItem(item)}
            noSelectBackground
          >
            <ListItemIcon>
              <Checkbox checked={selectedOptions.includes(item)} />
            </ListItemIcon>
            <ListItemText primary={item} />
          </MenuItem>
        ))}
        <Divider />
        <Box p={0.5}>
          <Box display="flex" gap={1} mb={1}>
            <Button
              startIcon={<FontAwesomeIcon icon={faEye} />}
              sx={{ flex: 1 }}
              variant="tertiary"
              size="xs"
            >
              Show All
            </Button>
            <Button
              startIcon={<FontAwesomeIcon icon={faEyeSlash} />}
              sx={{ flex: 1 }}
              variant="tertiary"
              size="xs"
            >
              Hide All
            </Button>
          </Box>
          <Button
            fullWidth
            startIcon={<FontAwesomeIcon icon={faEyeSlash} />}
            variant="tertiary"
            size="xs"
          >
            Hide empty properties
          </Button>
        </Box>
      </Select>
    </FormControl>
  );
};
