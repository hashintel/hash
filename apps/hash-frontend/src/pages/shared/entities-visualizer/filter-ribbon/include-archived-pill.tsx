import { Box, Radio, Stack, Typography } from "@mui/material";

import { MenuItem } from "../../../../shared/ui";
import { FilterPill } from "./filter-pill";

import type { EntitiesFilterState } from "./types";
import type { FunctionComponent } from "react";

export const IncludeArchivedPill: FunctionComponent<{
  archived: EntitiesFilterState["archived"];
  setArchived: (next: EntitiesFilterState["archived"]) => void;
}> = ({ archived, setArchived }) => {
  return (
    <FilterPill
      label="Include archived"
      valueSummary={archived.include ? "Yes" : "No"}
      isActive={archived.include}
      onRemove={() => setArchived({ pillAdded: false, include: false })}
    >
      {(close) => (
        <Box sx={{ minWidth: 200 }}>
          <Stack sx={{ py: 0.5 }}>
            <MenuItem
              onClick={() => {
                setArchived({ ...archived, include: false });
                close();
              }}
              sx={{ py: 0.5 }}
            >
              <Radio
                checked={!archived.include}
                size="small"
                sx={{ mr: 1, p: 0.25 }}
              />
              <Typography sx={{ fontSize: 13 }}>No (default)</Typography>
            </MenuItem>
            <MenuItem
              onClick={() => {
                setArchived({ ...archived, include: true });
                close();
              }}
              sx={{ py: 0.5 }}
            >
              <Radio
                checked={archived.include}
                size="small"
                sx={{ mr: 1, p: 0.25 }}
              />
              <Typography sx={{ fontSize: 13 }}>Yes</Typography>
            </MenuItem>
          </Stack>
        </Box>
      )}
    </FilterPill>
  );
};
