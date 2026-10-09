import { Box, Container } from "@mui/material";

import { largePageMaxWidthCss } from "../page-width";
import { inSlideContainerStyles } from "./slide-styles";

export const TypeDefinitionContainer = ({
  children,
  inSlide,
  wide,
}: {
  children: React.ReactNode;
  inSlide?: boolean;
  wide?: boolean;
}) => {
  return (
    <Box
      py={5}
      sx={({ palette }) => ({ background: palette.gray[10], height: "100%" })}
    >
      <Container
        sx={{
          ...(inSlide ? inSlideContainerStyles : {}),
          ...(!inSlide && wide ? largePageMaxWidthCss : {}),
        }}
      >
        {children}
      </Container>
    </Box>
  );
};
