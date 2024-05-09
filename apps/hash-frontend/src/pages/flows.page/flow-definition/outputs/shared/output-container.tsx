import type { SxProps, Theme } from "@mui/material";
import { Box } from "@mui/material";
import type { PropsWithChildren } from "react";

import { flowSectionBorderRadius } from "../../shared/styles";

export const OutputContainer = ({
  children,
  sx,
}: PropsWithChildren<{ sx?: SxProps<Theme> }>) => (
  <Box
    sx={[
      {
        background: ({ palette }) => palette.common.white,
        border: ({ palette }) => `1px solid ${palette.gray[20]}`,
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
