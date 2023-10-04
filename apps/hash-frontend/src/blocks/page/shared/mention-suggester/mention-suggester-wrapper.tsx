import { Box, styled } from "@mui/material";

export const MentionSuggesterWrapper = styled(Box)(({ theme }) => ({
  borderStyle: "solid",
  borderWidth: 1,
  borderColor: theme.palette.gray[20],
  borderRadius: "6px",
  width: 330,
  maxHeight: 400,
  boxShadow:
    "0px 20px 41px rgba(61, 78, 133, 0.07), 0px 16px 25px rgba(61, 78, 133, 0.0531481), 0px 12px 12px rgba(61, 78, 133, 0.0325), 0px 2px 3.13px rgba(61, 78, 133, 0.02)",
  overflowY: "auto",
  background: theme.palette.common.white,
  paddingLeft: theme.spacing(0.75),
  paddingRight: theme.spacing(0.75),
}));
