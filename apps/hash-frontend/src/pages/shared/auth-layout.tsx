import type { BoxProps } from "@mui/material";
import { Box, Container } from "@mui/material";
import type { FunctionComponent, PropsWithChildren, ReactNode } from "react";

import { HashIcon } from "../../shared/icons/hash-icon";

export const AuthLayout: FunctionComponent<
  PropsWithChildren & {
    headerEndAdornment?: ReactNode;
    sx?: BoxProps["sx"];
  }
> = ({ children, headerEndAdornment, sx }) => {
  return (
    <Box
      sx={[
        {
          background: ({ palette }) => palette.gray[10],
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Container
        sx={{
          paddingY: 4.25,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <HashIcon />
        <Box>{headerEndAdornment}</Box>
      </Container>
      <Container
        sx={{
          flexGrow: 1,
          display: "flex",
          alignItems: "center",
          position: "relative",
        }}
      >
        {children}
      </Container>
    </Box>
  );
};
