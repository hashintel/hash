import { Box, Typography } from "@mui/material";
import { parse } from "papaparse";
import { useMemo } from "react";

import type { FlowRun } from "../../../graphql/api-types.gen";
import { Csv } from "./deliverable/csv";

export const Deliverable = ({ outputs }: { outputs?: FlowRun["outputs"] }) => {
  const flowOutputs = useMemo(
    () => outputs?.[0]?.contents?.[0]?.outputs ?? [],
    [outputs],
  );

  const { parsedCsv, textAnswer } = useMemo(() => {
    const answer = flowOutputs.find((output) => output.outputName === "answer")
      ?.payload.value;

    if (typeof answer !== "string") {
      return { parsedCsv: undefined, textAnswer: undefined };
    }

    try {
      return {
        parsedCsv: parse<string[]>(answer, {
          header: false,
        }),
      };
    } catch {
      return { textAnswer: answer };
    }
  }, [flowOutputs]);

  return (
    <Box
      sx={{
        background: ({ palette }) => palette.common.white,
        border: ({ palette }) => `1px solid ${palette.gray[20]}`,
        borderRadius: 2,
        height: "100%",
        textAlign: "center",
      }}
    >
      {parsedCsv ? (
        <Csv parsedCsv={parsedCsv} />
      ) : (
        <Box
          sx={{
            display: "flex",
            height: "100%",
            justifyContent: "center",
            alignItems: "center",
            p: 4,
          }}
        >
          <Typography
            sx={{
              color: ({ palette }) => palette.gray[60],
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {textAnswer ??
              "The end output of this task will appear here when ready"}
          </Typography>
        </Box>
      )}
    </Box>
  );
};
