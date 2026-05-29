import { useDebouncedCallback } from "@mantine/hooks";
import { Box, InputBase } from "@mui/material";
import { useState } from "react";

import { IconButton, XMarkRegularIcon } from "@hashintel/design-system";

import { SearchIcon } from "../../../../shared/icons";

import type { FunctionComponent } from "react";

/**
 * Matches the global search bar. Each settled query triggers an embedding
 * generation + a subgraph fetch, so debouncing protects the backend.
 */
const SEMANTIC_SEARCH_DEBOUNCE_MS = 300;

/**
 * A dismissable semantic-search filter pill, added from the "Add filter" menu
 * and rendered among the other filter pills. Styled to match the filter pills,
 * with an inline borderless input and an × to remove.
 *
 * The pill owns its instantly-updating input buffer and only reports the
 * debounced value up via `onQueryChange`. It is conditionally rendered by its
 * parent, so it remounts (and re-seeds from `initialQuery`) whenever the filter
 * is added — meaning a "Clear filters" never leaves a stale query behind.
 */
export const SemanticSearchPill: FunctionComponent<{
  initialQuery: string;
  onQueryChange: (query: string) => void;
  onRemove: () => void;
}> = ({ initialQuery, onQueryChange, onRemove }) => {
  const [displayedQuery, setDisplayedQuery] = useState(initialQuery);

  // `flushOnUnmount` so a final keystroke isn't dropped when the pill unmounts
  // mid-debounce (e.g. selecting a row swaps the filter ribbon for the bulk
  // actions bar). The `setSemanticQuery` guard safely ignores a flushed write
  // if the pill was instead removed (which sets `added: false`).
  const reportQuery = useDebouncedCallback(onQueryChange, {
    delay: SEMANTIC_SEARCH_DEBOUNCE_MS,
    flushOnUnmount: true,
  });

  return (
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
        sx={{
          height: 13,
          width: "auto",
          fill: ({ palette }) => palette.gray[50],
        }}
      />
      <InputBase
        autoFocus
        placeholder="Search by meaning…"
        value={displayedQuery}
        onChange={(event) => {
          setDisplayedQuery(event.target.value);
          reportQuery(event.target.value);
        }}
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
};
