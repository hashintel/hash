import { Box, Typography } from "@mui/material";
import { forwardRef, PropsWithChildren, ReactElement } from "react";

export const OrgSettingsContainer = forwardRef<
  HTMLSpanElement,
  PropsWithChildren<{ header: string | ReactElement; sectionLabel?: string }>
>(({ children, header, sectionLabel }, ref) => {
  return (
    <>
      <Typography ref={ref} variant="h2" mb={4} mt={-1} fontWeight="bold">
        {header}
      </Typography>
      {sectionLabel && (
        <Typography component="h4" variant="mediumCaps" mb={2}>
          {sectionLabel}
        </Typography>
      )}

      <Box
        sx={({ palette }) => ({
          background: palette.common.white,
          borderRadius: 1.5,
          boxShadow: "0px 1px 5px 0px rgba(27, 33, 40, 0.07)",
        })}
      >
        {children}
      </Box>
    </>
  );
});
