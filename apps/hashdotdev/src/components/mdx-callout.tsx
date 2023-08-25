import { Stack } from "@mui/material";
import { HTMLAttributes } from "react";

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
        px: 5,
        py: 4,
        "& p:last-child": { mb: 0 },
      })}
    >
      {!hideIcon && (
        <CircleInfoLightIcon
          sx={({ palette }) => ({
            fontSize: 32,
            fontWeight: 300,
            fill: palette.gray[50],
            mt: 0.5,
            mr: 2.5,
          })}
        />
      )}
      {children}
    </Stack>
  );
};
