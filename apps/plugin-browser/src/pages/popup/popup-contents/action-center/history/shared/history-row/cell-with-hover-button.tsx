import { Fade, Stack, TableCell } from "@mui/material";
import type { PropsWithChildren, ReactElement } from "react";
import { useState } from "react";

export const CellWithHoverButton = ({
  button,
  children,
}: PropsWithChildren<{ button: ReactElement }>) => {
  const [hovered, setHovered] = useState(false);

  return (
    <TableCell
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{ position: "relative" }}
    >
      {children}
      <Fade in={hovered} timeout={300}>
        <Stack
          sx={{
            alignItems: "flex-end",
            background:
              "linear-gradient(270deg, #F7F7F7 64.29%, rgba(247, 247, 247, 0) 100%)",
            "@media (prefers-color-scheme: dark)": {
              background: ({ palette }) =>
                `linear-gradient(270deg, ${palette.common.black} 64.29%, rgba(0, 0, 0, 0) 100%)`,
            },
            justifyContent: "center",
            position: "absolute",
            pr: 1,
            right: 0,
            top: 0,
            height: "100%",
            "& a:hover svg, & button:hover svg": {
              fill: ({ palette }) => palette.blue[70],
            },
            "& svg": {
              fill: ({ palette }) => palette.gray[50],
              fontSize: 13,
              transition: ({ transitions }) => transitions.create("fill"),
            },
            width: 57,
          }}
        >
          {button}
        </Stack>
      </Fade>
    </TableCell>
  );
};
