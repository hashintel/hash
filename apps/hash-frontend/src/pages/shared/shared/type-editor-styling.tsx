import { Box } from "@mui/material";
import { Container, type SxProps, type Theme } from "@mui/system";

export const typeHeaderContainerStyles: SxProps<Theme> = ({ palette }) => ({
  borderBottom: 1,
  borderColor: palette.gray[20],
  pt: 3.75,
  backgroundColor: palette.common.white,
});

export const TypeDefinitionContainer = ({
  children,
}: { children: React.ReactNode }) => {
  return (
    <Box py={5}>
      <Container>{children}</Container>
    </Box>
  );
};
