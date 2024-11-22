import type { SxProps, Theme } from "@mui/material";
import { Box, Stack, Tooltip } from "@mui/material";
import type { PropsWithChildren, ReactElement } from "react";

export const ValueChip = ({
  children,
  icon,
  type,
  showInFull,
  sx,
  tooltip,
}: PropsWithChildren<{
  icon?: ReactElement;
  type?: boolean;
  showInFull?: boolean;
  sx?: SxProps<Theme>;
  tooltip?: string;
}>) => (
  <Tooltip title={tooltip} placement="left">
    <Stack
      direction="row"
      alignItems="center"
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
                width: "fit-content",
              }),
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {icon && (
        <Box component="span" sx={{ mr: 0.8, height: 14 }}>
          {icon}
        </Box>
      )}
      <Box
        sx={
          showInFull
            ? {}
            : {
                display: "block",
                overflow: "hidden",
                textOverflow: "ellipsis",
                width: "fit-content",
              }
        }
      >
        {children}
      </Box>
    </Stack>
  </Tooltip>
);
