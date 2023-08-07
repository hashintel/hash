import { Container, ContainerProps } from "@mui/material";
import { PropsWithChildren } from "react";

export const MainContainer = ({
  children,
  sx,
  ...props
}: PropsWithChildren & ContainerProps) => {
  return (
    <Container
      component="main"
      sx={{
        maxWidth: {
          lg: 800,
        },
        ...sx,
      }}
      {...props}
    >
      {children}
    </Container>
  );
};
