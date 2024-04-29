import type { StepOutput } from "@local/hash-isomorphic-utils/flows/types";
import { Box, Typography } from "@mui/material";
import { parse } from "papaparse";
import { useMemo } from "react";

import type { FlowRun } from "../../../graphql/api-types.gen";
import { Link } from "../../../shared/ui/link";
import { getFileProperties } from "../../shared/get-file-properties";
import { Csv } from "./deliverable/csv";

const Deliverable = ({ output }: { output: StepOutput }) => {
  const { payload } = output;

  if (payload.kind === "FormattedText") {
    if (!Array.isArray(payload.value) && payload.value.format === "CSV") {
      try {
        const parsedCsv = parse<string[]>(payload.value.content, {
          header: false,
        });

        return <Csv parsedCsv={parsedCsv} />;
      } catch {
        // unparseable
      }
    }
  } else if (payload.kind === "Entity" && !Array.isArray(payload.value)) {
    const entity = payload.value;

    const { displayName, fileName, fileUrl } = getFileProperties(
      entity.properties,
    );

    if (fileUrl) {
      return (
        <Box>
          <Link href={fileUrl}>
            <Typography>
              Download file:{" "}
              <strong>{displayName ?? fileName ?? "Untitled"}</strong>
            </Typography>
          </Link>
        </Box>
      );
    }
  }

  return null;
};

export const Deliverables = ({ outputs }: { outputs?: FlowRun["outputs"] }) => {
  const flowOutputs = useMemo(
    () => outputs?.[0]?.contents?.[0]?.outputs,
    [outputs],
  );

  return (
    <Box
      sx={{
        background: ({ palette }) => palette.common.white,
        border: ({ palette }) => `1px solid ${palette.gray[20]}`,
        borderRadius: 2,
        height: "100%",
        textAlign: "center",
        justifyContent: "center",
        alignItems: "center",
        p: 4,
      }}
    >
      {flowOutputs ? (
        flowOutputs.map((output) => (
          <Box key={output.outputName} mb={2}>
            <Deliverable output={output} />
          </Box>
        ))
      ) : (
        <Box
          sx={{
            height: "100%",
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
      )}
    </Box>
  );
};
