import { ArrowUpRightIcon } from "@hashintel/design-system";
import { Box, Stack, SvgIconProps, Typography } from "@mui/material";
import { FunctionComponent, PropsWithChildren } from "react";

export const Action = ({
  children,
  headerText,
  HeaderIcon,
  linkText,
  linkHref,
}: PropsWithChildren<{
  headerText: string;
  HeaderIcon: FunctionComponent<SvgIconProps>;
  linkText: string;
  linkHref: string;
}>) => {
  return (
    <Box
      sx={({ palette }) => ({
        background: palette.gray[10],
        px: 2.5,
        py: 2,
        "&:not(:last-child)": {
          borderBottom: `1px solid ${palette.gray[30]}`,
        },
        "@media (prefers-color-scheme: dark)": {
          background: "#1f2022",
          color: palette.common.white,

          "&:not(:last-child)": {
            borderBottom: `1px solid ${palette.gray[80]}`,
          },
        },
      })}
    >
      <Stack direction="row" justifyContent="space-between" mb={1}>
        <Stack alignItems="center" direction="row">
          <HeaderIcon
            sx={({ palette }) => ({ fill: palette.gray[50], height: 16 })}
          />
          <Typography
            variant="smallCaps"
            sx={{ fontSize: 13, fontWeight: 600, ml: 0.2 }}
          >
            {headerText}
          </Typography>
        </Stack>
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
      </Stack>
      {children}
    </Box>
  );
};
