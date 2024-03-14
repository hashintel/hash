import { Box, Stack, Typography } from "@mui/material";
import type { PropsWithChildren, ReactNode } from "react";
import { forwardRef } from "react";

export const SettingsPageContainer = forwardRef<
  HTMLSpanElement,
  PropsWithChildren<{
    topRightElement?: ReactNode;
    heading: ReactNode;
    subHeading?: ReactNode;
    disableContentWrapper?: boolean;
    sectionLabel?: string;
  }>
>(
  (
    {
      topRightElement,
      children,
      heading,
      subHeading,
      disableContentWrapper,
      sectionLabel,
    },
    ref,
  ) => {
    return (
      <>
        <Box marginBottom={4}>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
          >
            <Typography ref={ref} variant="h2" mt={-1} fontWeight="bold">
              {heading}
            </Typography>
            {topRightElement}
          </Stack>
          {subHeading ? (
            <Typography
              variant="h3"
              sx={{
                marginTop: 1,
                fontSize: 24,
                color: ({ palette }) => palette.gray[60],
                fontWeight: 400,
              }}
            >
              {subHeading}
            </Typography>
          ) : null}
        </Box>
        {sectionLabel && (
          <Typography component="h4" variant="mediumCaps" mb={2}>
            {sectionLabel}
          </Typography>
        )}
        {disableContentWrapper ? (
          children
        ) : (
          <Box
            sx={({ palette }) => ({
              background: palette.common.white,
              borderRadius: 1.5,
              boxShadow: "0px 1px 5px 0px rgba(27, 33, 40, 0.07)",
            })}
          >
            {children}
          </Box>
        )}
      </>
    );
  },
);
