import { Box, Stack } from "@mui/material";
import type { HTMLAttributes } from "react";

import { CircleInfoLightIcon } from "./icons/circle-info-light-icon";

export const MdxCallout = ({
  children,
  hideIcon,
}: HTMLAttributes<HTMLElement> & { hideIcon?: boolean }) => {
  return (
    <Stack
      direction="row"
      sx={({ palette }) => ({
        border: `1px solid ${palette.gray[30]}`,
        borderRadius: 2,
        background: palette.gray[10],
        color: palette.gray[80],
        flexWrap: { xs: "wrap", sm: "nowrap" },
        px: { xs: 3, sm: 5 },
        py: { xs: 2.25, sm: 4 },
        "& p:last-child": { mb: 0 },
      })}
    >
      {!hideIcon && (
        <Box
          sx={{
            mb: { xs: 1, sm: 0 },
            mt: { xs: 0, sm: 0.5 },
            mr: { xs: 0, sm: 2.5 },
            width: { xs: "100%", sm: "auto" },
          }}
        >
          <CircleInfoLightIcon
            sx={({ palette }) => ({
              fontSize: 32,
              fontWeight: 300,
              fill: palette.gray[50],
            })}
          />
        </Box>
      )}
      {children}
    </Stack>
  );
};
