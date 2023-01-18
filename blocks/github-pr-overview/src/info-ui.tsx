import { LoadingSpinner } from "@local/design-system";
import { Box, Typography } from "@mui/material";
import { FunctionComponent } from "react";

import { GithubIcon } from "./icons";

export type PullRequestSelectorProps = {
  title?: string;
  loading?: boolean;
};

export const InfoUI: FunctionComponent<PullRequestSelectorProps> = ({
  title,
  loading,
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

        {loading && (
          <Box display="flex" justifyContent="center" color="blue.60">
            <LoadingSpinner size={50} thickness={6} />
          </Box>
        )}
      </Box>
    </Box>
  );
};
