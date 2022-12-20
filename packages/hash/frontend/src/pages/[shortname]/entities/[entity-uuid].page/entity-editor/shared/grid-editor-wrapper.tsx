import { Box, experimental_sx as sx, styled } from "@mui/material";

export const GridEditorWrapper = styled(Box)(({ theme }) =>
  sx({
    width: "100%",
    border: "1px solid",
    borderColor: "gray.30",
    borderRadius: theme.borderRadii.lg,
    background: "white",
    overflow: "hidden",
    minHeight: 48,
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  }),
);
