import type { IconButtonProps } from "@hashintel/design-system";
import { IconButton } from "@hashintel/design-system";

export const GrayToBlueIconButton = ({ sx, ...props }: IconButtonProps) => {
  return (
    <IconButton
      {...props}
      sx={[
        ({ palette }) => ({
          background: "white",
          border: `1px solid ${palette.gray[30]}`,
          color: "gray.70",
          transition: ({ transitions }) => [
            transitions.create(["background", "border", "color"]),
          ],
          p: 0.7,
          "&.Mui-disabled": {
            background: palette.gray[30],
            border: `1px solid ${palette.gray[40]}`,
          },
          "&:hover": {
            background: "blue.10",
            border: `1px solid ${palette.blue[25]}`,
            color: "blue.70",
          },
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
};
