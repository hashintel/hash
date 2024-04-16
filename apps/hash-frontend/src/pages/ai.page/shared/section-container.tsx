import type { SxProps, Theme } from "@mui/material";
import { Container } from "@mui/material";
import type { PropsWithChildren } from "react";

export const SectionContainer = ({
  children,
  sx,
}: PropsWithChildren<{ sx?: SxProps<Theme> }>) => (
  <Container
    sx={[
      {
        width: "100%",
        borderRadius: 2,
        borderColor: ({ palette }) => palette.gray[30],
        borderWidth: 1,
        borderStyle: "solid",
        background: ({ palette }) => palette.common.white,
        paddingX: 4.5,
        paddingY: 3.25,
        marginTop: 3,
      },
      ...(Array.isArray(sx) ? sx : [sx]),
    ]}
  >
    {children}
  </Container>
);
