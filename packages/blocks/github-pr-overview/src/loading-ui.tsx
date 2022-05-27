import React from "react";
import { Box, Typography } from "@mui/material";
// import { LoadingSpinner } from "@hashintel/hash-design-system";

export type PullRequestSelectorProps = {
  title?: string;
};

export const LoadingUI: React.FunctionComponent<PullRequestSelectorProps> = ({
  title,
}) => {
  return (
    <Box
      sx={({ palette }) => ({
        maxWidth: 560,
        mx: "auto",
        border: `2px dashed ${palette.gray[40]}`,
        background: palette.white,
        pt: 5,
        pb: 6,
        px: 10,
        display: "flex",
        justifyContent: "center",
        borderRadius: "6px",
      })}
    >
      <Box
        sx={{
          maxWidth: 400,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Box sx={{ height: 56, width: 56, border: "1px solid red", mb: 2 }}>
          {/* icon here */}
        </Box>
        <Typography variant="h2" sx={{ textAlign: "center", mb: 3 }}>
          {title}
        </Typography>

        <Box display="flex" justifyContent="center">
          {/* <LoadingSpinner size={50} thickness={8} /> */}
        </Box>
      </Box>
    </Box>
  );
};
