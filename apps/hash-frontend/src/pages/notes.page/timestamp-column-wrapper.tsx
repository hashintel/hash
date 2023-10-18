import { Box, styled } from "@mui/material";

const timestampColumnWidth = 150;

export const TimestampColumnWrapper = styled(Box)({
  width: timestampColumnWidth,
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-end",
});
