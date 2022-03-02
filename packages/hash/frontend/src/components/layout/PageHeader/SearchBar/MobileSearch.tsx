import { Box, Button, InputBase, styled } from "@mui/material";

import { SearchIcon } from "../../../icons";

const SearchIconWrapper = styled("div")(({ theme }) => ({
  padding: theme.spacing(0, 2),
  height: "100%",
  position: "absolute",
  pointerEvents: "none",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
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
      <Button
        onClick={() => {
          setQueryText("");
          setDisplaySearchInput(false);
        }}
        variant="tertiary_quiet"
      >
        Cancel
      </Button>
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
