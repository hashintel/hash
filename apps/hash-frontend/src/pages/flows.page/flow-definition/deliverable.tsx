import type { StepRunOutput } from "@local/hash-isomorphic-utils/flows/types";
import {
  Box,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { parse } from "papaparse";
import { useMemo } from "react";

import { Cell } from "../../settings/organizations/shared/cell";
import { OrgTable } from "../../settings/organizations/shared/org-table";

export const Deliverable = ({ outputs }: { outputs?: StepRunOutput[] }) => {
  const flowOutputs = useMemo(
    () => outputs?.[0]?.contents?.[0]?.outputs ?? [],
    [outputs],
  );

  const parsedCsv = useMemo(() => {
    const answer = flowOutputs.find((output) => output.outputName === "answer")
      ?.payload.value;

    if (typeof answer !== "string") {
      return null;
    }

    try {
      return parse<(string | number | boolean)[]>(answer, { header: false });
    } catch {
      return null;
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
        <OrgTable sx={{ maxWidth: "100%", overflow: "hidden" }}>
          <TableHead>
            <TableRow>
              {parsedCsv.data[0]?.map((column) => (
                <Cell key={column.toString()}>{column}</Cell>
              ))}
            </TableRow>
          </TableHead>

          <TableBody>
            {parsedCsv.data.slice(1).map((row, index) => {
              return (
                // eslint-disable-next-line react/no-array-index-key -- no better alternative, arbitrary CSV data
                <TableRow key={index} sx={{ fontSize: 13 }}>
                  {row.map((content, idx) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <TableCell key={idx}>{content}</TableCell>
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
            The end output of this task will appear here when ready
          </Typography>
        </Box>
      )}
    </Box>
  );
};
