import { ArrowUpRightIcon } from "@hashintel/design-system";
import type { SvgIconProps } from "@mui/material";
import { Box, Stack, Typography } from "@mui/material";
import type { FunctionComponent, PropsWithChildren } from "react";

import {
  darkModeBorderColor,
  darkModeInputColor,
  lightModeBorderColor,
} from "../../../../shared/style-values";

export const Section = ({
  children,
  description,
  headerText,
  HeaderIcon,
  linkText,
  linkHref,
}: PropsWithChildren<{
  description?: string;
  headerText: string;
  HeaderIcon?: FunctionComponent<SvgIconProps>;
  linkText?: string;
  linkHref?: string;
}>) => {
  return (
    <Box
      sx={({ palette }) => ({
        px: 2.5,
        py: 2,
        borderTop: `1px solid ${lightModeBorderColor}`,
        "@media (prefers-color-scheme: dark)": {
          background: "#1f2022",
          color: palette.common.white,
          borderTop: `1px solid ${darkModeBorderColor}`,
        },
        "&:first-of-type": {
          borderTop: "none",
        },
      })}
    >
      <Stack direction="row" justifyContent="space-between" mb={1}>
        <Stack alignItems="center" direction="row">
          {HeaderIcon && (
            <HeaderIcon
              sx={({ palette }) => ({ fill: palette.gray[50], height: 16 })}
            />
          )}
          <Typography
            variant="smallCaps"
            sx={{ fontSize: 12, fontWeight: 600, ml: 0.2 }}
          >
            {headerText}
          </Typography>
        </Stack>
        {linkText && linkHref && (
          <Stack
            component="a"
            direction="row"
            href={linkHref}
            target="_blank"
            sx={{ alignItems: "center", textDecoration: "none" }}
          >
            <Typography
              variant="microText"
              sx={({ palette }) => ({
                color: palette.gray[50],
                fontSize: 14,
                fontWeight: 500,
                "&:hover": {
                  color: palette.gray[80],
                  "@media (prefers-color-scheme: dark)": {
                    color: palette.common.white,
                  },
                },
              })}
            >
              {linkText}
            </Typography>
            <ArrowUpRightIcon
              sx={({ palette }) => ({ fill: palette.gray[50], height: 14 })}
            />
          </Stack>
        )}
      </Stack>
      {description && (
        <Typography
          sx={({ palette }) => ({
            color: palette.gray[90],
            fontSize: 14,
            mb: 1.5,
            "@media (prefers-color-scheme: dark)": {
              color: darkModeInputColor,
            },
          })}
        >
          {description}
        </Typography>
      )}
      {children}
    </Box>
  );
};
