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

export interface ChipCellProps {
  readonly kind: "chip-cell";
  chips: string[];
}

export type ChipCell = CustomCell<ChipCellProps>;

export const renderChipCell: CustomRenderer<ChipCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is ChipCell =>
    (cell.data as any).kind === "chip-cell",
  draw: (args, cell) => {
    const { theme, rect } = args;
    const { chips } = cell.data;

    const chipGap = 8;
    let chipLeft = rect.x + theme.cellHorizontalPadding;

    for (let i = 0; i < chips.length; i++) {
      const chipWidth = drawChipWithIcon(args, chips[i] ?? "", chipLeft);

      chipLeft += chipWidth + chipGap;
    }

    drawCellFadeOutGradient(args);
  },
  provideEditor: (cell) => {
    const { chips } = cell.data;

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
            {chips.map((chip) => (
              <Chip
                key={chip}
                label={chip}
                icon={<FontAwesomeIcon icon={faAsterisk} />}
              />
            ))}
          </Box>
        );
      },
    };
  },
};
