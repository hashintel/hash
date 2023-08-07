import { Box, IconButton, styled } from "@mui/material";
import { FunctionComponent } from "react";

import { ArrowDownLeftAndArrowUpRightToCenterIcon } from "../../components/icons/arrow-down-left-and-arrow-up-right-to-center-icon";
import { ArrowUpRightAndArrowDownLeftFromCenterIcon } from "../../components/icons/arrow-up-right-and-arrow-down-left-from-center-icon";
import { FaIcon } from "../../components/icons/fa-icon";

const TechnologyTreeIconButton = styled(IconButton)(({ theme }) => ({
  background: theme.palette.white,
  borderColor: theme.palette.gray[30],
  borderStyle: "solid",
  borderWidth: 1,
  borderRadius: "4px",
}));

export const TechnologyTreeButtons: FunctionComponent<{
  toggleDisplayFilters: () => void;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  hidden: boolean;
}> = ({ hidden, toggleDisplayFilters, isFullscreen, toggleFullscreen }) => {
  return (
    <Box
      sx={{
        position: "absolute",
        zIndex: 2,
        paddingTop: 2,
        px: 2,
        transition: ({ transitions }) => transitions.create("opacity"),
        opacity: hidden ? 0 : 1,
        display: "flex",
        justifyContent: "space-between",
        width: "100%",
      }}
    >
      <TechnologyTreeIconButton
        onClick={toggleFullscreen}
        sx={{
          transition: ({ transitions }) => transitions.create("opacity"),
          svg: {
            fontSize: 14,
            color: ({ palette }) => palette.gray[50],
          },
        }}
      >
        {isFullscreen ? (
          <ArrowDownLeftAndArrowUpRightToCenterIcon />
        ) : (
          <ArrowUpRightAndArrowDownLeftFromCenterIcon />
        )}
      </TechnologyTreeIconButton>
      <TechnologyTreeIconButton onClick={toggleDisplayFilters}>
        <FaIcon
          name="filter"
          type="regular"
          sx={{
            fontSize: 14,
            color: ({ palette }) => palette.gray[50],
          }}
        />
      </TechnologyTreeIconButton>
    </Box>
  );
};
