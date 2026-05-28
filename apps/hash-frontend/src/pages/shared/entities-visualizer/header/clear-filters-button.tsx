import { Box } from "@mui/material";

import { Chip, XMarkRegularIcon } from "@hashintel/design-system";

import type { FunctionComponent } from "react";

type ClearFiltersButtonProps = {
  onClear: () => void;
};

export const ClearFiltersButton: FunctionComponent<ClearFiltersButtonProps> = ({
  onClear,
}) => {
  return (
    <Box>
      <Chip
        onClick={onClear}
        icon={
          <XMarkRegularIcon
            sx={{ fill: ({ palette }) => palette.gray[60], fontSize: 12 }}
          />
        }
        label="Clear"
        sx={{
          height: 26,
          borderRadius: "4px",
          cursor: "pointer",
          border: `1px solid transparent`,
          background: "transparent",
          color: ({ palette }) => palette.gray[70],
          fontSize: 13,
          fontWeight: 500,
          "& .MuiChip-label": {
            color: ({ palette }) => palette.gray[70],
            fontSize: 13,
            fontWeight: 500,
          },
          "&:hover": {
            background: ({ palette }) => palette.gray[20],
            "& .MuiChip-label": {
              color: ({ palette }) => palette.gray[90],
            },
          },
        }}
      />
    </Box>
  );
};
