import {
  faClockRotateLeft,
  faEllipsisVertical,
  faFile,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/hash-design-system";
import { Box, Typography } from "@mui/material";
import { ReactNode } from "react";
import { useSidebarContext } from "../../shared/layout/layout-with-sidebar";
import { useReadonlyMode } from "../../shared/readonly-mode";
import { Button } from "../../shared/ui";
import { Breadcrumbs } from "./breadcrumbs";

type Props = {
  crumbs: { title: string; href: string; id: string }[];
  defaultCrumbIcon?: ReactNode;
  scrollToTop: () => void;
};

export const TOP_CONTEXT_BAR_HEIGHT = 50;

export const TopContextBar = ({
  crumbs,
  defaultCrumbIcon = <FontAwesomeIcon icon={faFile} />,
  scrollToTop,
}: Props) => {
  const { readonlyMode } = useReadonlyMode();
  const { sidebarOpen } = useSidebarContext();
  return (
    <Box
      display="flex"
      alignItems="center"
      height={TOP_CONTEXT_BAR_HEIGHT}
      pl={sidebarOpen ? 3 : 8}
      pr={4}
    >
      <Box>
        <Breadcrumbs
          crumbs={crumbs}
          defaultIcon={defaultCrumbIcon}
          scrollToTop={scrollToTop}
        />
      </Box>

      <Box
        ml="auto"
        alignItems="center"
        sx={({ palette }) => ({
          display: readonlyMode ? "none" : "flex",
          "& > *": {
            color: palette.gray[50],
            "&:hover": {
              color: palette.gray[70],
            },
          },
        })}
      >
        <Button variant="tertiary_quiet" size="xs">
          <Typography variant="smallTextLabels" whiteSpace="nowrap">
            <Box component="strong">0</Box> comments
          </Typography>
        </Button>

        <Button variant="tertiary_quiet" size="xs">
          Share
        </Button>
        <Button
          variant="tertiary_quiet"
          size="xs"
          startIcon={<FontAwesomeIcon icon={faClockRotateLeft} />}
        >
          v2.3.1
        </Button>
        <IconButton>
          <FontAwesomeIcon icon={faEllipsisVertical} />
        </IconButton>
      </Box>
    </Box>
  );
};
