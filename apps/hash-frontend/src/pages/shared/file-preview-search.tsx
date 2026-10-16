import { faXmark } from "@fortawesome/free-solid-svg-icons";
import {
  Box,
  Collapse,
  outlinedInputClasses,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import debounce from "lodash/debounce";
import { useEffect, useRef, useState } from "react";

import {
  ArrowDownRegularIcon,
  ArrowUpRegularIcon,
  FontAwesomeIcon,
  IconButton,
  TextField,
} from "@hashintel/design-system";

import { FontCaseRegularIcon } from "../../shared/icons/font-case-regular-icon";
import { GrayToBlueIconButton } from "./gray-to-blue-icon-button";

type FilePreviewSearchProps = {
  closeSearch: () => void;
  /**
   * Called, debounced, when the search text or the case setting changes,
   * and at once with an empty `text` when the search is cleared.
   */
  onSearch: (text: string, ignoreCase: boolean) => void;
  onSelectHit: (index: number) => void;
  selectedIndex: number | null;
  showSearch: boolean;
  total: number;
};

export const FilePreviewSearch = ({
  closeSearch,
  onSearch,
  onSelectHit,
  selectedIndex,
  showSearch,
  total,
}: FilePreviewSearchProps) => {
  const [ignoreCase, setIgnoreCase] = useState(true);
  const [searchText, setSearchText] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedSearch = debounce(onSearch, 300);

  const previousHitIndex =
    selectedIndex !== null && selectedIndex > 0 ? selectedIndex - 1 : null;

  const nextHitIndex =
    selectedIndex !== null && selectedIndex < total - 1
      ? selectedIndex + 1
      : null;

  useEffect(() => {
    if (showSearch) {
      inputRef.current?.focus();
    }
  }, [showSearch]);

  return (
    <Collapse orientation="horizontal" in={showSearch}>
      <Box>
        <TextField
          autoFocus
          inputRef={inputRef}
          InputProps={{
            endAdornment: (
              <Tooltip title="Clear Search">
                <IconButton
                  onClick={() => {
                    setSearchText("");
                    onSearch("", ignoreCase);
                    closeSearch();
                  }}
                  sx={{ mr: 0.5 }}
                  size="small"
                  unpadded
                >
                  <FontAwesomeIcon icon={faXmark} />
                </IconButton>
              </Tooltip>
            ),
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && nextHitIndex !== null) {
              onSelectHit(nextHitIndex);
            }
          }}
          onChange={(event) => {
            const text = event.target.value;
            setSearchText(text);
            debouncedSearch(text, ignoreCase);
          }}
          placeholder="Search the document..."
          sx={{
            width: 200,
            [`.${outlinedInputClasses.root} input`]: {
              fontSize: 13,
              py: 0.8,
              px: 1.5,
            },
          }}
          value={searchText}
        />
        <Stack direction="row" gap={2} mt={0.8} justifyContent="flex-start">
          <GrayToBlueIconButton
            aria-label={ignoreCase ? "Match case" : "Ignore case"}
            onClick={() => {
              debouncedSearch(searchText, !ignoreCase);
              setIgnoreCase(!ignoreCase);
              inputRef.current?.focus();
            }}
            sx={{ "& svg": { fontSize: 13 }, p: 0.5 }}
          >
            <FontCaseRegularIcon
              sx={{
                fill: ({ palette }) =>
                  ignoreCase ? undefined : palette.blue[70],
                transition: ({ transitions }) => transitions.create("fill"),
              }}
            />
          </GrayToBlueIconButton>
          <Collapse orientation="horizontal" in={!!searchText} timeout={200}>
            <Stack
              direction="row"
              alignItems="center"
              gap={1}
              sx={{ height: 22 }}
            >
              <GrayToBlueIconButton
                aria-label="Previous result"
                disabled={previousHitIndex === null}
                onClick={() => {
                  if (previousHitIndex !== null) {
                    onSelectHit(previousHitIndex);
                  }
                }}
                sx={{ "& svg": { fontSize: 10 }, p: 0.6 }}
              >
                <ArrowUpRegularIcon />
              </GrayToBlueIconButton>
              <Typography
                component="span"
                sx={{
                  fontSize: 12,
                  color: ({ palette }) => palette.gray[90],
                  whiteSpace: "nowrap",
                }}
              >
                {`${(selectedIndex ?? -1) + 1} of ${total}`}
              </Typography>
              <GrayToBlueIconButton
                aria-label="Next result"
                disabled={nextHitIndex === null}
                onClick={() => {
                  if (nextHitIndex !== null) {
                    onSelectHit(nextHitIndex);
                  }
                }}
                sx={{ "& svg": { fontSize: 10 }, p: 0.6 }}
              >
                <ArrowDownRegularIcon />
              </GrayToBlueIconButton>
            </Stack>
          </Collapse>
        </Stack>
      </Box>
    </Collapse>
  );
};
