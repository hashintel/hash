import { Box } from "@mui/material";

import type { FunctionComponent, ReactNode } from "react";

export const visualizerHeaderHeight = 52;

type VisualizerHeaderProps = {
  left: ReactNode;
  right: ReactNode;
};

export const VisualizerHeader: FunctionComponent<VisualizerHeaderProps> = ({
  left,
  right,
}) => {
  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      sx={{
        background: ({ palette }) => palette.gray[20],
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: ({ palette }) => palette.gray[30],
        px: 1.5,
        py: 1,
        borderTopLeftRadius: "6px",
        borderTopRightRadius: "6px",
        gap: 1.5,
        minHeight: visualizerHeaderHeight,
      }}
    >
      <Box display="flex" gap={1.5} alignItems="center" flex={1} minWidth={0}>
        {left}
      </Box>
      <Box display="flex" alignItems="center" columnGap={1}>
        {right}
      </Box>
    </Box>
  );
};
