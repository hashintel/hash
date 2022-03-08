import { Box, Button, InputBase, IconButton } from "@mui/material";

import { SearchIcon } from "../../../icons";

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
      <Box
        sx={(theme) => ({
          position: "relative",
          borderRadius: theme.shape.borderRadius,
          marginRight: theme.spacing(1),
          width: "100%",
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
          type="text"
          value={displayedQuery}
          onFocus={() => setResultListVisible(true)}
          onChange={(event) => {
            setResultListVisible(true);
            setQueryText(event.target.value);
          }}
          inputProps={{ "aria-label": "search" }}
          sx={(theme) => ({
            color: "inherit",
            lineHeight: "18px",
            width: "100%",
            "& .MuiInputBase-input": {
              padding: theme.spacing(1, 1, 1, 0),
              // vertical padding + font size from searchIcon
              paddingLeft: theme.spacing(4.5),
              transition: theme.transitions.create("width"),
              border: `1px solid ${theme.palette.gray[30]}`,
              borderRadius: "6px",
              position: "relative",

              ":focus": {
                margin: "-1px",
                border: `2px solid ${theme.palette.blue[70]}`,
              },
            },
          })}
        />
      </Box>
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
    <IconButton
      sx={{
        height: "100%",
        display: "flex",
        alignItems: "center",
        mr: 2,
      }}
      onClick={() => setDisplaySearchInput(true)}
    >
      <SearchIcon
        sx={(theme) => ({ height: theme.spacing(2), width: "auto" })}
      />
    </IconButton>
  );
};
