import { Box, Container } from "@mui/material";
import { type SxProps, type Theme } from "@mui/system";

import { inSlideContainerStyles } from "./slide-styles";

export const typeHeaderContainerStyles: SxProps<Theme> = ({ palette }) => ({
  borderBottom: 1,
  borderColor: palette.gray[20],
  pt: 3.75,
  backgroundColor: palette.common.white,
});

export const TypeDefinitionContainer = ({
  children,
  inSlide,
}: { children: React.ReactNode; inSlide?: boolean }) => {
  return (
    <Box
      py={5}
      sx={({ palette }) => ({ background: palette.gray[10], height: "100%" })}
    >
      <Container sx={inSlide ? inSlideContainerStyles : {}}>
        {children}
      </Container>
    </Box>
  );
};
