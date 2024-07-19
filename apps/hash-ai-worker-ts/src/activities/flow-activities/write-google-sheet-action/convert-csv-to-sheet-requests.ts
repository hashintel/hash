import type { sheets_v4 } from "googleapis";
import type { ParseResult } from "papaparse";
import Papa from "papaparse";

import { createCellFromValue } from "./shared/create-sheet-data.js";

type SheetOutputFormat = {
  audience: "human" | "machine";
};

type ParsedCsvRow = (string | number | boolean)[];

/**
 * Create requests to the Google Sheets API to create a sheet from a CSV-formatted string.
 *
 * This function could later return an abstraction of sheet requests (e.g. Create Sheet, Insert Rows)
 * to be converted into calls to different spreadsheet APIs.
 */
export const convertCsvToSheetRequests = ({
  csvString,
  format,
}: {
  csvString: string;
  format: SheetOutputFormat;
}): sheets_v4.Schema$Request[] => {
  let parsedCsv: ParseResult<ParsedCsvRow>;
  try {
    parsedCsv = Papa.parse<ParsedCsvRow>(csvString, {
      dynamicTyping: true,
      header: false,
      skipEmptyLines: "greedy", // ignore empty lines, whitespace counts as empty
    });
  } catch (err) {
    throw new Error(
      `Could not parse csvString content: ${(err as Error).message}`,
    );
  }

  const data = parsedCsv.data;

  if (!data[0]) {
    throw new Error(`CSV content is empty`);
  }

  const humanReadable = format.audience === "human";

  const rows: sheets_v4.Schema$RowData[] = [];

  const headerCells = data[0].map((value) =>
    createCellFromValue({ value, applyDefaultHeaderFormat: humanReadable }),
  );

  rows.push({ values: headerCells });

  rows.push(
    ...data.slice(1).map((row) => ({
      values: row.map((value) => createCellFromValue({ value })),
    })),
  );

  const sheetId = 0;

  const requests: sheets_v4.Schema$Request[] = [
    {
      addSheet: {
        properties: {
          gridProperties: {
            frozenRowCount: format.audience === "human" ? 1 : 0,
          },
          sheetId,
          title: "Data",
        },
      },
    },
    {
      updateCells: {
        fields: "*",
        range: {
          sheetId,
          startRowIndex: 0,
        },
        rows,
      },
    },
    ...(humanReadable
      ? [
          {
            setBasicFilter: {
              filter: {
                range: {
                  sheetId,
                  startRowIndex: 0,
                  endRowIndex: rows.length,
                  startColumnIndex: 0,
                  endColumnIndex: rows[0]?.values?.length ?? 0,
                },
              },
            },
          },
          {
            autoResizeDimensions: {
              dimensions: {
                sheetId,
                dimension: "COLUMNS",
              },
            },
          },
        ]
      : []),
  ];

  return requests;
};
