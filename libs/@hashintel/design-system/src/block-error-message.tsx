import { Box, BoxProps, Typography } from "@mui/material";
import { FunctionComponent } from "react";

export type BlockErrorMessageProps = {
  apiName: string;
} & BoxProps;

export const BlockErrorMessage: FunctionComponent<BlockErrorMessageProps> = ({
  apiName,
  ...props
}) => {
  return (
    <Box
      {...props}
      display="flex"
      flexDirection="column"
      justifyContent="center"
      gap={1}
    >
      <Typography
        variant="smallTextLabels"
        sx={{
          fontWeight: 700,
          fontSize: 13,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          color: ({ palette }) => palette.black,
        }}
      >
        <Box component="span" sx={{ color: ({ palette }) => palette.red[60] }}>
          Error connecting
        </Box>{" "}
        to the {apiName} API
      </Typography>
      <Typography
        sx={{
          fontWeight: 500,
          fontSize: 15,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          color: ({ palette }) => palette.gray[50],
        }}
      >
        Check your network connection or contact support if this issue persists.
      </Typography>
    </Box>
  );
};
