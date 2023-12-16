import { Switch, switchClasses, SwitchProps } from "@mui/material";

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
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
};
