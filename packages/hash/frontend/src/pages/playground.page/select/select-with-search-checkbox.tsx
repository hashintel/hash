import {
  Box,
  Divider,
  FormControl,
  InputLabel,
  ListItemText,
  MenuItem,
  Select,
} from "@mui/material";
import { useMemo, useState } from "react";
import { TextField } from "../../../shared/ui";

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

  const filteredMenuItems = useMemo(() => {
    return MENU_ITEMS.filter((item) =>
      item.toLowerCase().includes(query.toLowerCase()),
    );
  }, [query]);

  return (
    <FormControl>
      <InputLabel
        sx={{ visibility: "visible", color: "red" }}
        shrink={false}
        disableAnimation
        variant="standard"
      />
      <Select fullWidth defaultValue="Poslight">
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
        <Divider />
        {filteredMenuItems.map((item) => (
          <MenuItem key={item} value={item}>
            <ListItemText primary={item} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};
