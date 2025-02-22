import { Box } from "@mui/material";
import { Container } from "@mui/system";
import type { PropsWithChildren } from "react";

import { inSlideContainerStyles } from "../../../../shared/shared/slide-styles";

export const EntityEditorContainer = ({
  children,
  isInSlide,
}: PropsWithChildren<{ isInSlide: boolean }>) => {
  return (
    <Box
      sx={({ palette }) => ({
        borderTop: 1,
        borderColor: palette.gray[20],
        bgcolor: palette.gray[10],
      })}
    >
      <Container sx={{ py: 7, ...(isInSlide ? inSlideContainerStyles : {}) }}>
        {children}
      </Container>
    </Box>
  );
};
