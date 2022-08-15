import {
  faClockRotateLeft,
  faEllipsisVertical,
  faFile,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/hash-design-system";
import { Box, Typography } from "@mui/material";
import { ReactNode } from "react";
import { useReadonlyMode } from "../../shared/readonly-mode";
import { Button } from "../../shared/ui";
import { Breadcrumbs } from "./breadcrumbs";

type Props = {
  crumbs: { title: string; href: string; id: string }[];
  defaultCrumbIcon?: ReactNode;
};

export const TopContextBar = ({
  crumbs,
  defaultCrumbIcon = <FontAwesomeIcon icon={faFile} />,
}: Props) => {
  const { readonlyMode } = useReadonlyMode();
  return (
    <Box display="flex" alignItems="center" height={50} pl={3} pr={4}>
      <Box>
        <Breadcrumbs crumbs={crumbs} defaultIcon={defaultCrumbIcon} />
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
