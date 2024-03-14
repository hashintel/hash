import type { StackProps } from "@mui/material";
import { Box, Stack, useTheme } from "@mui/material";
import type { FunctionComponent } from "react";

export const BlueStylishDivider: FunctionComponent<StackProps> = (props) => {
  const { palette } = useTheme();
  const size = 12;

  const boxDefinitions: { color: string; opacity?: number }[] = [
    { color: palette.aqua[90] },
    { color: palette.aqua[70] },
    { color: palette.aqua[80] },
    { color: palette.aqua[70] },
    { color: palette.aqua[40] },
    { color: palette.aqua[50], opacity: 0.5 },
    { color: palette.aqua[40], opacity: 0.5 },
    { color: "#9EE9E4", opacity: 0.5 },
    { color: palette.aqua[40], opacity: 0.2 },
    { color: palette.aqua[40], opacity: 0.2 },
    { color: palette.aqua[40] },
    { color: palette.aqua[40], opacity: 0.2 },
  ];

  return (
    <Stack direction="row" alignItems="stretch" height={12} {...props}>
      {boxDefinitions.map(({ color, opacity }, i) => (
        <Box
          // eslint-disable-next-line react/no-array-index-key
          key={i}
          sx={{
            width: size,
            height: size,
            background: color,
            opacity: opacity ?? 1,
          }}
        />
      ))}
    </Stack>
  );
};
