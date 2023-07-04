import { Box, Stack, StackProps, useTheme } from "@mui/material";
import { FunctionComponent } from "react";

export const BlueStylishDivider: FunctionComponent<StackProps> = (props) => {
  const { palette } = useTheme();
  const size = 12;

  const boxDefinitions: { color: string; opacity?: number }[] = [
    { color: palette.turquoise[90] },
    { color: palette.turquoise[70] },
    { color: palette.turquoise[80] },
    { color: palette.turquoise[70] },
    { color: palette.turquoise[40] },
    { color: palette.turquoise[50], opacity: 0.5 },
    { color: palette.turquoise[40], opacity: 0.5 },
    { color: "#9EE9E4", opacity: 0.5 },
    { color: palette.turquoise[40], opacity: 0.2 },
    { color: palette.turquoise[40], opacity: 0.2 },
    { color: palette.turquoise[40] },
    { color: palette.turquoise[40], opacity: 0.2 },
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
