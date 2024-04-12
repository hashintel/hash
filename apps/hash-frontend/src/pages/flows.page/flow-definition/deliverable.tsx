import {
  Box,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { StepOutput } from "@local/hash-isomorphic-utils/src/flows/types";
import { parse } from "papaparse";
import { useMemo } from "react";
import { OrgTable } from "../../settings/organizations/shared/org-table";
import { Cell } from "../../settings/organizations/shared/cell";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/src/generate-entity-label";
export const Deliverable = ({ outputs }: { outputs: StepOutput[] }) => {
  const flowOutputs = outputs?.[0]?.contents?.[0]?.flowOutputs ?? [];

  const parsedCsv = useMemo(() => {
    const answer = flowOutputs.find((output) => output.outputName === "answer")
      ?.payload.value;

    if (!answer) {
      return null;
    }

    try {
      const parsed = parse(answer, { header: false });
      return parsed;
    } catch {
      return null;
    }
  }, [flowOutputs]);

  console.log({ parsedCsv });

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
        <OrgTable sx={{ maxWidth: "100%", overflow: "hidden" }}>
          <TableHead>
            <TableRow>
              {parsedCsv.data[0]?.map((column) => (
                <Cell key={column}>{column}</Cell>
              ))}
            </TableRow>
          </TableHead>

          <TableBody>
            {parsedCsv.data.slice(1).map((row, index) => {
              return (
                <TableRow key={index} sx={{ fontSize: 13 }}>
                  {row.map((content) => (
                    <TableCell key={content}>{content}</TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </OrgTable>
      ) : (
        <Box
          sx={{
            display: "flex",
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
            The end output of this task will appear here when ready
          </Typography>
        </Box>
      )}
    </Box>
  );
};
