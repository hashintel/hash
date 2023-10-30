import { styled, Typography } from "@mui/material";

export const TimestampCollectionSubheading = styled(Typography)(
  ({ theme }) => ({
    color: theme.palette.gray[70],
    fontSize: 15,
    fontWeight: 500,
  }),
);
