import { faAsterisk } from "@fortawesome/free-solid-svg-icons";
import {
  CustomCell,
  CustomRenderer,
  GridCellKind,
} from "@glideapps/glide-data-grid";
import { Chip, FontAwesomeIcon } from "@hashintel/hash-design-system";
import { Box } from "@mui/material";
import { isPlainObject } from "lodash";
import { drawCellFadeOutGradient } from "../../../../../../../../components/GlideGlid/draw-cell-fade-out-gradient";
import { drawChipWithIcon } from "../../../../../../../../components/GlideGlid/utils";
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
    const { dataTypes, value } = cell.data.property;

    if (isPlainObject(value)) {
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
    const { dataTypes, value } = cell.data.property;

    /**
     * @todo instead of doing this, set `allowOverlay=false` in the cell data if type is object
     */
    if (isPlainObject(value)) {
      return;
    }

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
