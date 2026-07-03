import { Box, Stack, Typography } from "@mui/material";

import { graphColors } from "../visual-style";

const rgba = (color: readonly [number, number, number, number]) =>
  `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${color[3] / 255})`;

export const FrontierLegend = () => (
  <Box
    sx={{
      position: "absolute",
      left: 10,
      bottom: 10,
      zIndex: 7,
      pointerEvents: "none",
      px: 0.75,
      py: 0.5,
      borderRadius: 1.5,
      bgcolor: "rgba(255, 255, 255, 0.72)",
    }}
  >
    <Stack direction="row" alignItems="center" gap={1.25}>
      <Stack direction="row" alignItems="center" gap={0.75}>
        <Box
          sx={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            bgcolor: rgba(graphColors.frontier),
          }}
        />
        <Typography variant="microText" sx={{ color: "gray.70" }}>
          Grey nodes are frontier entities
        </Typography>
      </Stack>
      <Stack direction="row" alignItems="center" gap={0.75}>
        <Box
          sx={({ palette }) => ({
            width: 14,
            height: 2,
            borderRadius: 999,
            bgcolor: palette.gray[50],
          })}
        />
        <Typography variant="microText" sx={{ color: "gray.70" }}>
          Thick lanes bundle links
        </Typography>
      </Stack>
    </Stack>
  </Box>
);
