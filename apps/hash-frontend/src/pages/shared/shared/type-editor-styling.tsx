import { Box } from "@mui/material";
import { Container, type SxProps, type Theme } from "@mui/system";

export const typeHeaderContainerStyles: SxProps<Theme> = ({ palette }) => ({
  borderBottom: 1,
  borderColor: palette.gray[20],
  pt: 3.75,
  backgroundColor: palette.common.white,
});

export const inSlideContainerStyles = { px: "32px !important" };

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
