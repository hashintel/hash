import { Box, experimental_sx as sx, styled } from "@mui/material";

export const ListWrapper = styled(Box)(
  sx({
    maxHeight: 300,
    overflowY: "auto",
    overflowX: "hidden",
    borderBottom: "1px solid",
    borderColor: "gray.20",
  }),
);
