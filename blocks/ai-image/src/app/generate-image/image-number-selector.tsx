import type {
  DropdownSelectorProps,
  Option,
} from "@hashintel/block-design-system";
import { DropdownSelector } from "@hashintel/block-design-system";
import { Box, Typography } from "@mui/material";

import { GridIcon } from "../../icons/grid";
import { Grid2Icon } from "../../icons/grid-2";
import { SquareIcon } from "../../icons/square";

export const DEFAULT_IMAGE_NUMBER = "1";

const IMAGE_NUMBER_OPTIONS: Option[] = [
  {
    id: "1",
    icon: (
      <SquareIcon
        sx={{ boxSizing: "content-box", fontSize: 12, padding: 0.625 }}
      />
    ),
    title: "1 option",
    description: "A single image is produced",
  },
  {
    id: "4",
    icon: <Grid2Icon sx={{ fontSize: "inherit" }} />,
    title: "4 options",
    helperText: "Recommended",
    description: "Additional variants are produced",
  },
  {
    id: "9",
    icon: <GridIcon sx={{ fontSize: "inherit" }} />,
    title: "9 options",
    description: "Provides the most choices",
  },
];

export const ImageNumberSelector = (
  props: Omit<DropdownSelectorProps, "options" | "renderValue">,
) => (
  <DropdownSelector
    {...props}
    options={IMAGE_NUMBER_OPTIONS}
    renderValue={({ title }) => {
      return (
        <Typography
          variant="regularTextLabels"
          sx={{
            display: "inline-flex",
            gap: 1,
            alignItems: "center",
            fontSize: 15,
            lineHeight: 1,
            letterSpacing: -0.02,
            color: ({ palette }) => palette.gray[50],
          }}
        >
          Generating
          <Box
            component="span"
            sx={{
              display: "inline-flex",
              gap: 0.375,
              color: ({ palette }) => palette.gray[60],
            }}
          >
            {title}
          </Box>
        </Typography>
      );
    }}
  />
);
