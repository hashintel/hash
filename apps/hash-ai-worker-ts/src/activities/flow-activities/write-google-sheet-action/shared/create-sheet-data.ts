import { stringifyPropertyValue } from "@local/hash-isomorphic-utils/stringify-property-value";
import type { sheets_v4 } from "googleapis";

import { cellHeaderFormat, cellPadding } from "./format.js";

export const createCellFromValue = ({
  value,
  applyDefaultHeaderFormat,
}: {
  value: unknown;
  applyDefaultHeaderFormat?: boolean;
}): sheets_v4.Schema$CellData => {
  const userEnteredFormat = applyDefaultHeaderFormat
    ? cellHeaderFormat
    : { padding: cellPadding, wrapStrategy: "WRAP" };

  switch (typeof value) {
    case "number": {
      return {
        userEnteredValue: {
          numberValue: value,
        },
        userEnteredFormat,
      };
    }
    case "boolean": {
      return {
        userEnteredValue: {
          boolValue: value,
        },
        userEnteredFormat,
      };
    }
    default: {
      return {
        userEnteredValue: {
          stringValue: stringifyPropertyValue(value),
        },
        userEnteredFormat,
      };
    }
  }
};

export const createHyperlinkCell = ({
  label,
  sheetId,
  startCellInclusive,
  endCellInclusive,
}: {
  label: string;
  sheetId: number;
  startCellInclusive: string;
  endCellInclusive: string;
}) => ({
  userEnteredValue: {
    formulaValue: `=HYPERLINK("#gid=${sheetId}&range=${startCellInclusive}:${endCellInclusive}", "${label}")`,
  },
  userEnteredFormat: {
    padding: cellPadding,
  },
});
