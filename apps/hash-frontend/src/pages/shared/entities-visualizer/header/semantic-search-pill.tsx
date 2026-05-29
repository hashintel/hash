import { Box, InputBase } from "@mui/material";

import { IconButton, XMarkRegularIcon } from "@hashintel/design-system";

import { SearchIcon } from "../../../../shared/icons";

import type { FunctionComponent } from "react";

/**
 * A dismissable semantic-search filter pill, added from the "Add filter" menu
 * and rendered among the other filter pills. Styled to match the filter pills,
 * with an inline borderless input and an × to remove.
 */
export const SemanticSearchPill: FunctionComponent<{
  value: string;
  onChange: (value: string) => void;
  onRemove: () => void;
}> = ({ value, onChange, onRemove }) => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 0.75,
      height: 26,
      boxSizing: "border-box",
      pl: 1,
      pr: 0.5,
      borderRadius: "4px",
      border: ({ palette }) => `1px solid ${palette.gray[30]}`,
      background: ({ palette }) => palette.gray[5],
    }}
  >
    <SearchIcon
      sx={{ height: 13, width: "auto", fill: ({ palette }) => palette.gray[50] }}
    />
    <InputBase
      autoFocus
      placeholder="Search by meaning…"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      sx={{
        width: 190,
        "& .MuiInputBase-input": {
          p: 0,
          height: "auto",
          fontSize: 13,
          lineHeight: 1,
          color: ({ palette }) => palette.gray[70],
          "&::placeholder": {
            color: ({ palette }) => palette.gray[50],
            opacity: 1,
          },
        },
      }}
    />
    <IconButton
      size="small"
      onClick={onRemove}
      aria-label="Remove semantic search filter"
      sx={{
        p: 0.25,
        color: ({ palette }) => palette.gray[50],
        "&:hover": {
          color: ({ palette }) => palette.gray[70],
          background: "transparent",
        },
      }}
    >
      <XMarkRegularIcon />
    </IconButton>
  </Box>
);
