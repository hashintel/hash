import { Select, TextField } from "@local/hash-design-system";
import { Box, FormControl, InputLabel, ListItemText } from "@mui/material";
import { useMemo, useState } from "react";

import { MenuItem } from "../../../shared/ui";

const MENU_ITEMS = [
  "Poslight",
  "Greggs",
  "Pret",
  "Wetherspoons",
  "Chicken Cottage",
  "Gail's",
  "Franco Manca",
];

export const SelectWithSearch = () => {
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
        <Box sx={{ mx: 0.75 }}>
          <TextField
            fullWidth
            size="xs"
            placeholder="Search for Companies"
            value={query}
            onChange={(evt) => setQuery(evt.target.value)}
            onKeyDown={(evt) => {
              evt.stopPropagation();
            }}
          />
        </Box>
        {filteredMenuItems.map((item) => (
          <MenuItem key={item} value={item}>
            <ListItemText primary={item} />
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
};
