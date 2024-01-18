import { Box, Stack, Typography } from "@mui/material";
import { forwardRef, PropsWithChildren, ReactElement } from "react";

export const SettingsPageContainer = forwardRef<
  HTMLSpanElement,
  PropsWithChildren<{
    topRightElement?: ReactElement;
    header: string | ReactElement;
    disableContentWrapper?: boolean;
    sectionLabel?: string;
  }>
>(
  (
    { topRightElement, children, header, disableContentWrapper, sectionLabel },
    ref,
  ) => {
    return (
      <>
        <Stack
          direction="row"
          alignItems="center"
          mb={4}
          justifyContent="space-between"
        >
          <Typography ref={ref} variant="h2" mt={-1} fontWeight="bold">
            {header}
          </Typography>
          {topRightElement}
        </Stack>
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
