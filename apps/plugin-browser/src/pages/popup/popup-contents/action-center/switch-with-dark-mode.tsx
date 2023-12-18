import { Switch, switchClasses, SwitchProps } from "@mui/material";

export const SwitchWithDarkMode = (props: SwitchProps) => {
  const { sx } = props;
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
