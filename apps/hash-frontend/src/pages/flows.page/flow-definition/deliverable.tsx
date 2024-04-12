import { Box, Typography } from "@mui/material";
import { StepOutput } from "@local/hash-isomorphic-utils/src/flows/types";
import { parse } from "papaparse";
export const Deliverable = ({ outputs }: { outputs: StepOutput[] }) => {
  const flowOutputs = outputs?.[0]?.contents?.[0]?.flowOutputs ?? [];

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        p: 4,
        background: ({ palette }) => palette.common.white,
        border: ({ palette }) => `1px solid ${palette.gray[20]}`,
        borderRadius: 2,
        height: "100%",
        textAlign: "center",
      }}
    >
      <Typography
        sx={{
          color: ({ palette }) => palette.gray[60],
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        The end output of this task will appear here when ready
      </Typography>
    </Box>
  );
};
