import { faXmark } from "@fortawesome/free-solid-svg-icons";
import { alpha, Box, InputBase, styled } from "@mui/material";
import { useState } from "react";

import { FontAwesomeSvgIcon, SearchIcon } from "../../../icons";

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
  width: "100%",
  "& .MuiInputBase-input": {
    padding: theme.spacing(1, 1, 1, 0),
    // vertical padding + font size from searchIcon
    paddingLeft: `calc(1em + ${theme.spacing(3)})`,
    transition: theme.transitions.create("width"),
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
  marginRight: theme.spacing(2),
  width: "100%",
}));

export const MobileSearch: React.FC<{
  displayedQuery: string;
  setResultListVisible: (visible: boolean) => void;
  setQueryText: (queryText: string) => void;
  displaySearchInput: boolean;
  setDisplaySearchInput: (displaySearchInput: boolean) => void;
}> = ({
  displayedQuery,
  setQueryText,
  setResultListVisible,
  displaySearchInput,
  setDisplaySearchInput,
}) => {
  return displaySearchInput ? (
    <Box
      style={{ display: "flex", width: "100%", background: "white", zIndex: 1 }}
    >
      <Search>
        <SearchIconWrapper>
          <SearchIcon />
        </SearchIconWrapper>
        <StyledInputBase
          placeholder="Search for anything"
          type="text"
          value={displayedQuery}
          onFocus={() => setResultListVisible(true)}
          onChange={(event) => {
            setResultListVisible(true);
            setQueryText(event.target.value);
          }}
          inputProps={{ "aria-label": "search" }}
        />
      </Search>
      <Box>Cancel</Box>
    </Box>
  ) : (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        mr: 2,
      }}
      onClick={() => setDisplaySearchInput(true)}
    >
      <SearchIcon />
    </Box>
  );
};
