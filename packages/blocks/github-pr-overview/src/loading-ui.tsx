import React from "react";
import { Box, Typography } from "@mui/material";
import { GithubIcon } from "./icons";
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
        <Box mb={2}>
          <GithubIcon
            sx={({ palette }) => ({
              height: 56,
              width: 56,
              mb: 2,
              color: palette.gray[80],
            })}
          />
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
