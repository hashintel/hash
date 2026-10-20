import { IconButton } from "@hashintel/design-system";

import type { IconButtonProps } from "@hashintel/design-system";

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
          // `@hashintel/ds-components` tokens, as hex because their CSS
          // variables only resolve inside `.hash-ds-root`.
          '&[aria-pressed="true"]': {
            background: "#0090ff", // blue.bg.solid
            border: "1px solid #0090ff", // blue.bg.solid
            color: "#ffffff", // blue.fg.onSolid
            "&:hover": {
              background: "#0588f0", // blue.bg.solid.hover
              border: "1px solid #0588f0", // blue.bg.solid.hover
            },
          },
          "& svg": {
            fontSize: 13,
          },
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
};
