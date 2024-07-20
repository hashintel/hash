import type { PropsWithChildren } from "react";
import type { Box, SxProps, Theme } from "@mui/material";

import { flowSectionBorderRadius } from "../../shared/styles";

export const OutputContainer = ({
  children,
  noBorder,
  sx,
}: PropsWithChildren<{ noBorder?: boolean; sx?: SxProps<Theme> }>) => (
  <Box
    sx={[
      {
        background: ({ palette }) => palette.common.white,
        border: noBorder
          ? undefined
          : ({ palette }) => `1px solid ${palette.gray[20]}`,
        borderRadius: flowSectionBorderRadius,
        height: "100%",
        textAlign: "center",
        width: "100%",
      },
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
  >
    {children}
  </Box>
);
