import type { SwitchProps } from "@mui/material";
import { Switch, switchClasses } from "@mui/material";

export const SwitchWithDarkMode = ({ sx, ...props }: SwitchProps) => {
  return (
    <Switch
      {...props}
      sx={[
        ({ palette }) => ({
          "@media (prefers-color-scheme: dark)": {
            [`& .${switchClasses.thumb}`]: {
              bgcolor: palette.gray[20],
            },
            [`& .${switchClasses.track}`]: {
              bgcolor: palette.gray[70],
            },
          },
        }),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- @todo why is this any
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
};
