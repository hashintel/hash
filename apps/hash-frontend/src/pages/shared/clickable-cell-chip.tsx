import { ArrowUpRightIcon } from "@hashintel/design-system";
import { Box } from "@mui/material";
import type { ReactElement } from "react";

import { ValueChip } from "./value-chip";

export const ClickableCellChip = ({
  fontSize,
  icon,
  label,
  onClick,
}: {
  fontSize: number;
  icon?: ReactElement;
  label: string;
  onClick: () => void;
}) => {
  return (
    <Box
      component="button"
      onClick={onClick}
      sx={{
        alignItems: "center",
        background: "none",
        border: "none",
        display: "flex",
        cursor: "pointer",
        maxWidth: "100%",
        p: 0,
        textAlign: "left",
      }}
    >
      <ValueChip
        icon={icon}
        sx={{
          fontSize,
          fontWeight: 500,
        }}
      >
        {label}
      </ValueChip>
      <ArrowUpRightIcon
        sx={{
          fontSize: fontSize - 1,
          color: ({ palette }) => palette.blue[70],
          ml: 0.5,
        }}
      />
    </Box>
  );
};
