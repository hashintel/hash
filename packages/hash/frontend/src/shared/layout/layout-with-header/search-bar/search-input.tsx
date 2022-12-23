import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/hash-design-system";
import {
  Box,
  InputAdornment,
  OutlinedInput,
  Tooltip,
  Typography,
} from "@mui/material";
import { FunctionComponent, useCallback, useEffect, useRef } from "react";
import { useKeys } from "rooks";

import { SearchIcon } from "../../../icons";

const ClearSearchIcon: FunctionComponent<{
  clearSearch: () => void;
}> = ({ clearSearch }) => {
  return (
    <Box
      sx={{
        display: "flex",
        height: "100%",
        alignItems: "center",
        cursor: "pointer",
        fontWeight: "bold",
        width: "26px",
        justifyContent: "flex-end",
        marginRight: 1,
      }}
    >
      <Tooltip title="Clear search" placement="right">
        <IconButton size="small" unpadded onClick={clearSearch}>
          <FontAwesomeIcon icon={faXmark} />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

const ShortcutIcon = () => {
  const isMac = navigator.userAgent.toUpperCase().includes("MAC");

  return (
    <Box
      sx={{
        height: "100%",
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        fontWeight: "bold",
        marginRight: 0.5,
      }}
    >
      <Box
        sx={({ palette }) => ({
          height: "30px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: palette.gray[20],
          borderRadius: "2px",
          px: 1,
          py: 0.75,
        })}
      >
        <Typography
          variant="microText"
          sx={({ palette }) => ({
            color: palette.gray[60],
            fontWeight: 500,
          })}
        >
          {isMac ? "Cmd" : "Ctrl"} + P
        </Typography>
      </Box>
    </Box>
  );
};

export const SearchInput: FunctionComponent<{
  displayedQuery: string;
  isMobile: boolean;
  setResultListVisible: (visible: boolean) => void;
  setQueryText: (queryText: string) => void;
}> = ({ displayedQuery, isMobile, setResultListVisible, setQueryText }) => {
  const isMac = navigator.userAgent.toUpperCase().includes("MAC");

  const inputRef = useRef<HTMLInputElement>(null);

  useKeys(["ControlLeft", "KeyP"], (event) => {
    event.preventDefault();
    if (!isMac) {
      inputRef.current?.focus();
    }
  });

  useEffect(() => {
    function checkSearchKey(event: KeyboardEvent) {
      if (isMac && event.key === "p" && event.metaKey) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }

    document.addEventListener("keydown", checkSearchKey);

    return () => {
      document.removeEventListener("keydown", checkSearchKey);
    };
  }, [isMac]);

  const clearSearch = useCallback(() => {
    setQueryText("");
  }, [setQueryText]);

  return (
    <OutlinedInput
      placeholder="Search for anything"
      inputRef={inputRef}
      type="text"
      value={displayedQuery}
      onFocus={() => setResultListVisible(true)}
      onChange={(event) => {
        setResultListVisible(true);
        setQueryText(event.target.value);
      }}
      sx={{
        width: isMobile ? "100%" : "385px",
        "& .MuiInputBase-input": {
          paddingLeft: "unset",
          paddingRight: isMobile ? 1 : "unset",
        },
      }}
      inputProps={{ "aria-label": "search" }}
      startAdornment={
        <InputAdornment position="start">
          <Box
            sx={{
              height: "100%",
              pointerEvents: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <SearchIcon sx={{ height: "16px", width: "auto" }} />
          </Box>
        </InputAdornment>
      }
      endAdornment={
        !isMobile ? (
          <InputAdornment position="end">
            {displayedQuery ? (
              <ClearSearchIcon clearSearch={clearSearch} />
            ) : (
              <ShortcutIcon />
            )}
          </InputAdornment>
        ) : null
      }
    />
  );
};
