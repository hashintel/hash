import { Box, InputAdornment, InputBase, styled } from "@mui/material";
import { useRef } from "react";
import { useKeys } from "rooks";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

import { SearchIcon, FontAwesomeSvgIcon } from "../../../icons";

export const DesktopSearch: React.FC<{
  displayedQuery: string;
  setResultListVisible: (visible: boolean) => void;
  setQueryText: (queryText: string) => void;
}> = ({ displayedQuery, setResultListVisible, setQueryText }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useKeys(["AltLeft", "KeyK"], () => inputRef.current?.focus());

  return (
    <Box
      sx={(theme) => ({
        position: "relative",
        borderRadius: theme.spacing(0.75),
        marginRight: theme.spacing(2),
        border: `1px solid ${theme.palette.gray[30]}`,
        ":focus": {
          margin: "-1px",
          border: `2px solid ${theme.palette.blue[70]}`,
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
        <SearchIcon
          sx={(theme) => ({ height: theme.spacing(2), width: "auto" })}
        />
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
          lineHeight: "18px",
          "& .MuiInputBase-input": {
            py: theme.spacing(1),
            paddingLeft: theme.spacing(4.5),
          },
        })}
        inputProps={{ "aria-label": "search" }}
        endAdornment={
          <InputAdornment position="end">
            {displayedQuery.trim() ? (
              // @todo - the parent Box component was originally added in to help align the icon within the Search layout.
              // Perhaps this can be rewritten to no longer use the Box here?
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
                <Box
                  sx={(theme) => ({
                    width: theme.spacing(2.5),
                    height: theme.spacing(2.5),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: theme.spacing(0.25),
                    color: theme.palette.gray[50],

                    "&:hover": {
                      transition:
                        "color 0.2s ease-in-out, background-color 0.2s ease-in-out",
                      backgroundColor: theme.palette.gray[20],
                      color: theme.palette.gray[80],
                    },
                  })}
                  onClick={() => {
                    setQueryText("");
                  }}
                >
                  <FontAwesomeSvgIcon icon={faXmark} />
                </Box>
              </Box>
            ) : (
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
                    width: theme.spacing(3.25),
                    height: theme.spacing(3.25),
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: theme.palette.gray[50],
                    backgroundColor: theme.palette.gray[20],
                    borderRadius: theme.spacing(0.25),
                  })}
                >
                  /
                </Box>
              </Box>
            )}
          </InputAdornment>
        }
      />
    </Box>
  );
};
