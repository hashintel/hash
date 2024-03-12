import type { StackProps } from "@mui/material";
import { Stack } from "@mui/material";

export const DestinationTypeContainer = ({
  children,
  ...props
}: StackProps) => (
  <Stack
    direction="row"
    flexWrap="wrap"
    sx={[
      (theme) => ({
        border: 1,
        borderColor: "transparent",
        borderRadius: 1.5,
        p: 0.5,
        userSelect: "none",
        minWidth: 200,
        minHeight: 42,
        left: -7,
        width: "calc(100% + 14px)",
        overflow: "hidden",
        position: "relative",
        zIndex: theme.zIndex.drawer,
      }),
    ]}
    {...props}
  >
    {children}
  </Stack>
);
