import { Box, Container } from "@mui/material";
import type { PropsWithChildren } from "react";

import { inSlideContainerStyles } from "../shared/slide-styles";

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
