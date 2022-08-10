import {
  faClockRotateLeft,
  faEllipsisVertical,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon, IconButton } from "@hashintel/hash-design-system";
import { Box, Typography } from "@mui/material";
import { Button } from "../../../shared/ui";
import { Breadcrumbs } from "./breadcrumbs";

const crumbs = [
  {
    title: "Product manager applications in progress",
    href: "#",
  },
  {
    title: "Nesting level 1",
    href: "#",
  },
  {
    title: "Nesting level 2",
    href: "#",
  },
  {
    title: "Favourite candidates from my list of users",
    href: "#",
  },
];

export const PageContextBar = () => {
  return (
    <Box display="flex" alignItems="center" height={50} pl={3} pr={4}>
      <Box>
        <Breadcrumbs crumbs={crumbs} />
      </Box>

      <Box
        ml="auto"
        display="flex"
        alignItems="center"
        sx={({ palette }) => ({
          "& > *": {
            color: palette.gray[50],
            "&:hover": {
              color: palette.gray[70],
            },
          },
        })}
      >
        <Button variant="tertiary_quiet" size="xs">
          <Typography variant="smallTextLabels">
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
        {/*  */}
      </Box>
      {/*  */}
    </Box>
  );
};
