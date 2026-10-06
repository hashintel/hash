import { Box, Stack } from "@mui/material";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import type { FunctionComponent, KeyboardEvent, ReactNode } from "react";

/**
 * A replica of glide-data-grid's search overlay (which the Table view uses via
 * glide's built-in search), so searching the grid view looks and behaves the
 * same: the same icons, result status line, Enter / Shift+Enter navigation,
 * and the slide-in from the left the table restyles glide's overlay to.
 */

const upArrowIcon = (
  <Box component="svg" viewBox="0 0 512 512" sx={{ width: 16, height: 16 }}>
    <path
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="48"
      d="M112 244l144-144 144 144M256 120v292"
    />
  </Box>
);

const downArrowIcon = (
  <Box component="svg" viewBox="0 0 512 512" sx={{ width: 16, height: 16 }}>
    <path
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="48"
      d="M112 268l144 144 144-144M256 392V100"
    />
  </Box>
);

const closeIcon = (
  <Box component="svg" viewBox="0 0 512 512" sx={{ width: 16, height: 16 }}>
    <path
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="32"
      d="M368 368L144 144M368 144L144 368"
    />
  </Box>
);

const SearchOverlayButton: FunctionComponent<{
  ariaHidden: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: ReactNode;
}> = ({ ariaHidden, disabled, label, onClick, children }) => (
  <Box
    component="button"
    type="button"
    aria-label={label}
    aria-hidden={ariaHidden}
    tabIndex={ariaHidden ? -1 : undefined}
    disabled={disabled}
    onClick={onClick}
    sx={({ palette }) => ({
      width: 24,
      height: 24,
      padding: 0,
      border: "none",
      outline: "none",
      background: "none",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      cursor: "pointer",
      color: palette.gray[60],
      "&:hover": {
        color: palette.gray[80],
      },
      "&:disabled": {
        opacity: 0.4,
        pointerEvents: "none",
      },
    })}
  >
    {children}
  </Box>
);

export const GridViewSearch: FunctionComponent<{
  open: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  resultCount: number;
  /**
   * Position of the current result within the matches, or -1 for none yet.
   */
  selectedIndex: number;
  onSelectedIndexChange: (selectedIndex: number) => void;
  onClose: () => void;
}> = ({
  open,
  query,
  onQueryChange,
  resultCount,
  selectedIndex,
  onSelectedIndexChange,
  onClose,
}) => {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // Kept mounted through the 150ms slide-out, as glide's overlay is.
  const [keepMounted, setKeepMounted] = useState(false);

  useEffect(() => {
    if (open) {
      setKeepMounted(true);
    } else {
      const timeout = setTimeout(() => setKeepMounted(false), 150);
      return () => clearTimeout(timeout);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      onQueryChange("");
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [open, onQueryChange]);

  const selectNext = useCallback(() => {
    if (resultCount > 0) {
      onSelectedIndexChange((selectedIndex + 1) % resultCount);
    }
  }, [onSelectedIndexChange, resultCount, selectedIndex]);

  const selectPrevious = useCallback(() => {
    if (resultCount > 0) {
      onSelectedIndexChange(
        selectedIndex <= 0 ? resultCount - 1 : selectedIndex - 1,
      );
    }
  }, [onSelectedIndexChange, resultCount, selectedIndex]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (
        ((event.ctrlKey || event.metaKey) && event.code === "KeyF") ||
        event.key === "Escape"
      ) {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      } else if (event.key === "Enter") {
        if (event.shiftKey) {
          selectPrevious();
        } else {
          selectNext();
        }
      }
    },
    [onClose, selectNext, selectPrevious],
  );

  if (!open && !keepMounted) {
    return null;
  }

  return (
    <Box
      sx={({ palette }) => ({
        position: "absolute",
        top: 4,
        left: 20,
        backgroundColor: palette.common.white,
        color: palette.gray[80],
        padding: 1,
        border: `1px solid ${palette.gray[20]}`,
        borderRadius: "6px",
        fontSize: 13,
        "@keyframes grid-view-search-in": {
          from: { transform: "translateX(-400px)" },
          to: { transform: "translateX(0)" },
        },
        "@keyframes grid-view-search-out": {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-400px)" },
        },
        animation: `${
          open ? "grid-view-search-in" : "grid-view-search-out"
        } 0.15s forwards`,
      })}
    >
      <Stack direction="row">
        <Box
          component="input"
          id={inputId}
          ref={inputRef}
          aria-hidden={!open}
          tabIndex={open ? undefined : -1}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={handleKeyDown}
          sx={({ palette }) => ({
            width: 220,
            padding: 0,
            border: "none",
            outline: "none",
            color: palette.gray[80],
            backgroundColor: palette.common.white,
            fontFamily: "inherit",
            fontSize: "inherit",
          })}
        />
        <SearchOverlayButton
          ariaHidden={!open}
          disabled={resultCount === 0}
          label="Previous Result"
          onClick={selectPrevious}
        >
          {upArrowIcon}
        </SearchOverlayButton>
        <SearchOverlayButton
          ariaHidden={!open}
          disabled={resultCount === 0}
          label="Next Result"
          onClick={selectNext}
        >
          {downArrowIcon}
        </SearchOverlayButton>
        <SearchOverlayButton
          ariaHidden={!open}
          label="Close Search"
          onClick={onClose}
        >
          {closeIcon}
        </SearchOverlayButton>
      </Stack>
      {query ? (
        <Box sx={{ paddingTop: 0.5, fontSize: 11 }}>
          {selectedIndex >= 0 ? `${selectedIndex + 1} of ` : ""}
          {resultCount} result{resultCount === 1 ? "" : "s"}
        </Box>
      ) : (
        <Box
          component="label"
          htmlFor={inputId}
          sx={{ display: "block", paddingTop: 0.5, fontSize: 11 }}
        >
          Type to search
        </Box>
      )}
    </Box>
  );
};
