import { Box } from "@mui/material";

import type { FunctionComponent, ReactNode } from "react";

/**
 * Fallback height for the header (floating top row + grey bar), used in the
 * available-height calculation until the content position is measured.
 */
export const visualizerHeaderHeight = 94;

type VisualizerHeaderProps = {
  topLeft?: ReactNode;
  topRight: ReactNode;
  bottomLeft: ReactNode;
  bottomRight?: ReactNode;
};

export const VisualizerHeader: FunctionComponent<VisualizerHeaderProps> = ({
  topLeft,
  topRight,
  bottomLeft,
  bottomRight,
}) => {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          columnGap: 1.5,
        }}
      >
        <Box sx={{ alignSelf: "flex-end" }}>{topLeft}</Box>
        <Box sx={{ display: "flex", alignItems: "center", columnGap: 1.5 }}>
          {topRight}
        </Box>
      </Box>
      <Box
        sx={{
          display: "flow-root",
          background: ({ palette }) => palette.gray[20],
          borderWidth: 1,
          borderStyle: "solid",
          borderColor: ({ palette }) => palette.gray[30],
          px: 1.5,
          py: 1,
          borderTopLeftRadius: "6px",
          borderTopRightRadius: "6px",
          minHeight: 52,
        }}
      >
        {bottomRight ? (
          <Box sx={{ float: "right", ml: 1, my: 0.5 }}>{bottomRight}</Box>
        ) : null}
        {bottomLeft}
      </Box>
    </Box>
  );
};
