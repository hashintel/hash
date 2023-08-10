import { Box, Typography } from "@mui/material";
import {
  forwardRef,
  ForwardRefRenderFunction,
  PropsWithChildren,
  ReactElement,
  ReactNode,
} from "react";

import { Org } from "../../../../lib/user-and-org";

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
      <Box sx={{ background: "white", borderRadius: 6 }}>{children}</Box>
    </>
  );
});
