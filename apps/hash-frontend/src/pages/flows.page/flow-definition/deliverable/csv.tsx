import { TableBody, TableCell, TableHead, TableRow } from "@mui/material";
import type { ParseResult } from "papaparse";

import { Cell } from "../../../settings/organizations/shared/cell";
import { OrgTable } from "../../../settings/organizations/shared/org-table";

type CsvProps = {
  parsedCsv: ParseResult<(string | number | boolean)[]>;
};

export const Csv = ({ parsedCsv }: CsvProps) => {
  return (
    <OrgTable
      sx={{
        maxWidth: "100%",
        overflow: "auto",
        maxHeight: "100%",
        display: "block",
      }}
    >
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
  );
};
