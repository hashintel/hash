import { alpha, Box, InputBase, styled } from "@mui/material";
import { useRef } from "react";
import { useKeys } from "rooks";
import { faXmark } from "@fortawesome/free-solid-svg-icons";

import { SearchIcon, FontAwesomeSvgIcon } from "../../../icons";

const SearchIconWrapper = styled("div")(({ theme }) => ({
  padding: theme.spacing(0, 2),
  height: "100%",
  position: "absolute",
  pointerEvents: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}));

const SlashIconWrapper = styled("div")(({ theme }) => ({
  margin: theme.spacing(0, 1),
  height: "100%",
  position: "absolute",
  pointerEvents: "none",
  display: "flex",
  alignItems: "center",
  top: 0,
  right: 0,
  fontWeight: "bold",
}));

const CrossIconWrapper = styled("div")(({ theme }) => ({
  margin: theme.spacing(0, 1),
  marginRight: 0,
  padding: theme.spacing(0, 1),
  position: "absolute",
  display: "flex",
  height: "100%",
  alignItems: "center",
  cursor: "pointer",
  top: 0,
  right: 0,
  fontWeight: "bold",
}));

const StyledInputBase = styled(InputBase)(({ theme }) => ({
  color: "inherit",
  "& .MuiInputBase-input": {
    padding: theme.spacing(1, 0, 1, 0),
    // vertical padding + font size from searchIcon
    paddingLeft: `calc(1em + ${theme.spacing(3)})`,
    paddingRight: `calc(1em + ${theme.spacing(3)})`,
    transition: theme.transitions.create("width"),
    [theme.breakpoints.up("md")]: {
      width: "20ch",
    },
    border: `1px solid ${theme.palette.gray[30]}`,
    borderRadius: "6px",
    position: "relative",

    ":focus": {
      margin: "-1px",
      border: `2px solid ${theme.palette.blue[70]}`,
    },
  },
}));

const Search = styled("div")(({ theme }) => ({
  position: "relative",
  borderRadius: theme.shape.borderRadius,
  backgroundColor: alpha(theme.palette.common.white, 0.15),
  "&:hover": {
    backgroundColor: alpha(theme.palette.common.white, 0.25),
  },
  marginRight: theme.spacing(2),
}));

export const DesktopSearch: React.FC<{
  displayedQuery: string;
  setResultListVisible: (visible: boolean) => void;
  setQueryText: (queryText: string) => void;
}> = ({ displayedQuery, setResultListVisible, setQueryText }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useKeys(["AltLeft", "KeyK"], () => inputRef.current?.focus());

  return (
    <Search>
      <SearchIconWrapper>
        <SearchIcon />
      </SearchIconWrapper>
      <StyledInputBase
        placeholder="Search for anything"
        inputRef={inputRef}
        type="text"
        value={displayedQuery}
        onFocus={() => setResultListVisible(true)}
        onChange={(event) => {
          setResultListVisible(true);
          setQueryText(event.target.value);
        }}
        inputProps={{ "aria-label": "search" }}
      />
      {displayedQuery.trim() ? (
        <CrossIconWrapper>
          <Box
            sx={(theme) => ({
              width: theme.spacing(2.5),
              height: theme.spacing(2.5),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: theme.spacing(0.25),
              color: theme.palette.gray[50],
              transition: "all 0.2s ease-in-out",

              "&:hover": {
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
        </CrossIconWrapper>
      ) : (
        <SlashIconWrapper>
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
        </SlashIconWrapper>
      )}
    </Search>
  );
};
