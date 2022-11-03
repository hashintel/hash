import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import { Chip, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { Box } from "@mui/material";
import { drawCellFadeOutGradient } from "../../../../../../../../components/GlideGlid/utils/draw-cell-fade-out-gradient";
import { drawChipWithIcon } from "../../../../../../../../components/GlideGlid/utils/draw-chip-with-icon";
import { PropertyRow } from "../types";

export interface DataTypeCellProps {
  readonly kind: "data-type-cell";
  property: PropertyRow;
}

export type DataTypeCell = CustomCell<DataTypeCellProps>;

export const renderDataTypeCell: CustomRenderer<DataTypeCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is DataTypeCell =>
    (cell.data as any).kind === "data-type-cell",
  draw: (args, cell) => {
    const { theme, rect } = args;
    const { dataTypes, children } = cell.data.property;

    if (children.length) {
      return;
    }

    const chipGap = 8;
    let chipLeft = rect.x + theme.cellHorizontalPadding;

    for (let i = 0; i < dataTypes.length; i++) {
      const dataType = dataTypes[i] ?? "";

      const chipWidth = drawChipWithIcon(args, dataType, chipLeft);

      chipLeft += chipWidth + chipGap;
    }

    drawCellFadeOutGradient(args);
  },

  provideEditor: (cell) => {
    const { dataTypes } = cell.data.property;

    return {
      disablePadding: true,
      editor: (props) => {
        return (
          <Box
            sx={{
              display: "flex",
              gap: 1,
              p: 1,
              width: props.target.width,
              overflow: "scroll",
              "::-webkit-scrollbar": {
                display: "none",
              },
            }}
          >
            {dataTypes.map((type) => (
              <Chip
                key={type}
                label={type}
                icon={<FontAwesomeIcon icon={faAsterisk} />}
              />
            ))}
          </Box>
        );
      },
    };
  },
};
