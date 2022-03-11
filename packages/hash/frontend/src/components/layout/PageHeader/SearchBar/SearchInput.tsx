import {
  Box,
  IconButton,
  InputAdornment,
  InputBase,
  Tooltip,
  Typography,
} from "@mui/material";
import { useCallback, useEffect, useRef } from "react";
import { useKeys } from "rooks";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

import { SearchIcon, FontAwesomeSvgIcon } from "../../../icons";

const ClearSearchIcon: React.FC<{
  clearSearch: () => void;
}> = ({ clearSearch }) => {
  return (
    <Box
      sx={(theme) => ({
        marginRight: theme.spacing(1),
        display: "flex",
        height: "100%",
        alignItems: "center",
        cursor: "pointer",
        fontWeight: "bold",
        width: "26px",
        justifyContent: "flex-end",
      })}
    >
      <Tooltip title="Clear search" placement="right">
        <IconButton
          sx={(theme) => ({
            width: theme.spacing(2.5),
            height: theme.spacing(2.5),
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            // @todo figure out how to fetch this from `theme`
            borderRadius: "2px",
            color: theme.palette.gray[50],

            "&:hover": {
              transition: theme.transitions.create([
                "color",
                "background-color",
              ]),
              backgroundColor: theme.palette.gray[20],
              color: theme.palette.gray[80],
            },
          })}
          onClick={clearSearch}
        >
          <FontAwesomeSvgIcon icon={faXmark} />
        </IconButton>
      </Tooltip>
    </Box>
  );
};

const ShortcutIcon = () => {
  const isMac = navigator.userAgent.toUpperCase().includes("MAC");

  return (
    <Box
      sx={(theme) => ({
        marginRight: theme.spacing(1),
        height: "100%",
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        fontWeight: "bold",
      })}
    >
      <Box
        sx={(theme) => ({
          height: "26px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: theme.palette.gray[50],
          backgroundColor: theme.palette.gray[20],
          borderRadius: "2px",
          px: 1,
          py: 0.75,
        })}
      >
        <Typography variant="microText">
          {isMac ? "Cmd" : "Ctrl"} + P
        </Typography>
      </Box>
    </Box>
  );
};

export const SearchInput: React.FC<{
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
    <Box
      sx={(theme) => ({
        position: "relative",
        borderRadius: "6px",
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: theme.palette.gray[30],
        width: isMobile ? "100%" : "385px",
        ":focus-within": {
          margin: "-1px",
          borderWidth: 2,
          borderColor: theme.palette.blue[70],
          transition: theme.transitions.create([
            "border-color",
            "border-width",
            "margin",
          ]),
          ".MuiInputAdornment-root": {
            marginRight: "-2px",
            transition: theme.transitions.create(["margin"]),
          },
        },
      })}
    >
      <Box
        sx={(theme) => ({
          padding: theme.spacing(0, 1.5),
          height: "100%",
          position: "absolute",
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        })}
      >
        <SearchIcon sx={{ height: "16px", width: "auto" }} />
      </Box>
      <InputBase
        placeholder="Search for anything"
        inputRef={inputRef}
        type="text"
        value={displayedQuery}
        onFocus={() => setResultListVisible(true)}
        onChange={(event) => {
          setResultListVisible(true);
          setQueryText(event.target.value);
        }}
        sx={(theme) => ({
          color: "inherit",
          width: "100%",
          lineHeight: "18px",
          "& .MuiInputBase-input": {
            py: theme.spacing(1),
            paddingLeft: theme.spacing(4.5),
            paddingRight: isMobile ? 1 : "unset",
          },
        })}
        inputProps={{ "aria-label": "search" }}
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
    </Box>
  );
};
