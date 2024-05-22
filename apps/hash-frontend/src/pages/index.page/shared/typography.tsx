import type { SxProps, Theme } from "@mui/material";
import { Typography } from "@mui/material";
import type { PropsWithChildren } from "react";

export const HomepageBigText = ({
  children,
  sx,
}: PropsWithChildren<{ sx?: SxProps<Theme> }>) => (
  <Typography
    sx={[
      ({ palette, typography }) => ({
        color: palette.gray[90],
        fontSize: 32,
        fontFamily: typography.h3.fontFamily,
        fontWeight: 500,
        lineHeight: 1.1,
        "&:last-of-type": {
          mb: 3,
        },
      }),
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
  >
    {children}
  </Typography>
);

export const HomepageMediumText = ({
  children,
  sx,
}: PropsWithChildren<{ sx?: SxProps<Theme> }>) => (
  <Typography
    sx={[
      ({ palette }) => ({
        color: palette.gray[60],
        fontSize: 24,
        letterSpacing: "-2%",
        fontWeight: 500,
        mb: 3,
        mt: 1,
      }),
      ...(Array.isArray(sx) ? sx : []),
    ]}
  >
    {children}
  </Typography>
);

export const HomepageSmallCaps = ({
  children,
  sx,
}: PropsWithChildren<{ sx?: SxProps<Theme> }>) => (
  <Typography
    sx={[
      ({ palette }) => ({
        color: palette.gray[60],
        fontSize: 13,
        letterSpacing: "10%",
        fontWeight: 600,
        mb: 1,
        mt: 3.5,
        textTransform: "uppercase",
      }),
      ...(Array.isArray(sx) ? sx : []),
    ]}
  >
    {children}
  </Typography>
);
