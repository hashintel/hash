import type { PropsWithChildren } from "react";
import type { Stack, SxProps, Theme , Tooltip } from "@mui/material";

export const ValueChip = ({
  children,
  type,
  showInFull,
  sx,
  tooltip,
}: PropsWithChildren<{
  type?: boolean;
  showInFull?: boolean;
  sx?: SxProps<Theme>;
  tooltip?: string;
}>) => (
  <Tooltip title={tooltip} placement={"left"}>
    <Stack
      direction={"row"}
      alignItems={"center"}
      sx={[
        ({ palette }) => ({
          background: palette.common.white,
          border: `1px solid ${palette.gray[30]}`,
          borderRadius: type ? 4 : 2,
          display: "inline-flex",
          fontWeight: 500,
          fontSize: 12,
          lineHeight: 1,
          maxWidth: "100%",
          px: 1.2,
          py: 0.8,
          whiteSpace: "nowrap",
          ...(showInFull
            ? {}
            : {
                overflow: "hidden",
                textOverflow: "ellipsis",
              }),
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Stack>
  </Tooltip>
);
