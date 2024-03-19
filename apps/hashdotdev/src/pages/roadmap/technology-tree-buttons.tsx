import { Box, IconButton, styled } from "@mui/material";
import type { FunctionComponent } from "react";

import { ArrowDownLeftAndArrowUpRightToCenterIcon } from "../../components/icons/arrow-down-left-and-arrow-up-right-to-center-icon";
import { ArrowUpRightAndArrowDownLeftFromCenterIcon } from "../../components/icons/arrow-up-right-and-arrow-down-left-from-center-icon";
import { FilterRegularIcon } from "../../components/icons/filter-regular-icon";

const TechnologyTreeIconButton = styled(IconButton)(({ theme }) => ({
  background: theme.palette.white,
  borderColor: theme.palette.gray[30],
  borderStyle: "solid",
  borderWidth: 1,
  borderRadius: "4px",
  padding: 0,
  width: 25,
  height: 25,
  transition: theme.transitions.create("opacity"),
  svg: {
    fontSize: 14,
    color: theme.palette.gray[50],
  },
}));

export const TechnologyTreeButtons: FunctionComponent<{
  isDisplayingFilters: boolean;
  toggleDisplayFilters: () => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  hidden: boolean;
}> = ({
  hidden,
  toggleDisplayFilters,
  isDisplayingFilters,
  isFullscreen,
  toggleFullscreen,
}) => {
  return (
    <Box
      sx={{
        position: "absolute",
        zIndex: 2,
        paddingTop: 2.5,
        px: 3,
        transition: ({ transitions }) => transitions.create("opacity"),
        opacity: hidden ? 0 : 1,
        display: "flex",
        justifyContent: "space-between",
        width: "100%",
      }}
    >
      <TechnologyTreeIconButton onClick={toggleFullscreen}>
        {isFullscreen ? (
          <ArrowDownLeftAndArrowUpRightToCenterIcon />
        ) : (
          <ArrowUpRightAndArrowDownLeftFromCenterIcon />
        )}
      </TechnologyTreeIconButton>
      <TechnologyTreeIconButton
        onClick={toggleDisplayFilters}
        sx={{ opacity: isDisplayingFilters ? 0 : 1 }}
      >
        <FilterRegularIcon />
      </TechnologyTreeIconButton>
    </Box>
  );
};
