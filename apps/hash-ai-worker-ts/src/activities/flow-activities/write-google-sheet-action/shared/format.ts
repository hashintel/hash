import type { sheets_v4 } from "googleapis";

export const cellPadding = {
  top: 8,
  bottom: 8,
  right: 8,
  left: 8,
};

const backgroundStyle: sheets_v4.Schema$CellFormat = {
  backgroundColorStyle: {
    rgbColor: {
      red: 0.92,
      green: 0.94,
      blue: 1,
    },
  },
};

export const cellHeaderFormat: sheets_v4.Schema$CellFormat = {
  textFormat: {
    bold: true,
  },
  padding: cellPadding,
  ...backgroundStyle,
};
