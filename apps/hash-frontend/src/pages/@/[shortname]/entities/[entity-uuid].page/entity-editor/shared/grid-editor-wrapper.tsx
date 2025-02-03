import { Box, styled } from "@mui/material";

export const GridEditorWrapper = styled(Box)<{ minHeight?: number | string }>(
  ({ theme, minHeight = 48 }) =>
    theme.unstable_sx({
      width: "100%",
      border: "1px solid",
      borderColor: "gray.30",
      borderRadius: theme.borderRadii.lg,
      background: "white",
      minHeight,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      justifyContent: "center",
    }),
);
