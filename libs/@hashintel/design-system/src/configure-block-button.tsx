import { buttonClasses, ButtonProps } from "@mui/material";
import { FunctionComponent } from "react";

import { Button } from "./button";
import { ChevronRightIcon } from "./icons/chevron-right";
import { GearIcon } from "./icons/gear";

export type ConfigureBlockButtonProps = {
  expanded?: boolean;
} & ButtonProps;

export const ConfigureBlockButton: FunctionComponent<
  ConfigureBlockButtonProps
> = ({ expanded = false, sx, ...props }) => {
  return (
    <Button
      {...props}
      variant="tertiary_quiet"
      size="xs"
      startIcon={<GearIcon />}
      endIcon={<ChevronRightIcon sx={{ fontSize: "12px !important" }} />}
      sx={[
        ({ palette, transitions }) => ({
          p: 0,
          gap: 1,
          minHeight: 0,
          fontSize: 15,
          lineHeight: 1,
          letterSpacing: -0.02,
          whiteSpace: "nowrap",
          background: "none",
          color: `${palette.gray[50]}`,
          ":hover": {
            background: "none",
            color: palette.gray[60],
            [`& .${buttonClasses.startIcon}, .${buttonClasses.endIcon}`]: {
              color: palette.gray[50],
            },
          },
          [`.${buttonClasses.startIcon}, .${buttonClasses.endIcon}`]: {
            mx: 0,
            transition: transitions.create(["color", "transform"]),
            color: palette.gray[40],
          },
          [`.${buttonClasses.endIcon}`]: {
            transform: `rotate(${expanded ? 90 : 0}deg)`,
          },
          ...(Array.isArray(sx) ? sx : [sx]),
        }),
      ]}
    >
      Configure block
    </Button>
  );
};
