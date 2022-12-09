import { Grid } from "../../../../../../components/grid/grid";
import { useDrawCell } from "../../../../../../components/grid/utils/use-draw-cell";
import { renderChipCell } from "../properties-section/property-table/cells/chip-cell";
import { renderSummaryChipCell } from "../properties-section/property-table/cells/summary-chip-cell";
import { renderLinkCell } from "./link-table/cells/link-cell";
import { renderLinkedWithCell } from "./link-table/cells/linked-with-cell";
import { linkGridColumns } from "./link-table/constants";
import { useCreateGetCellContent } from "./link-table/use-create-get-cell-content";
import { useRows } from "./link-table/use-rows";

interface LinkTableProps {
  showSearch: boolean;
  onSearchClose: () => void;
}

export const LinkTable = ({ showSearch, onSearchClose }: LinkTableProps) => {
  const rows = useRows();
  const drawCell = useDrawCell();
  const createGetCellContent = useCreateGetCellContent();

  return (
    <Grid
      columns={linkGridColumns}
      rows={rows}
      createGetCellContent={createGetCellContent}
      drawCell={drawCell}
      showSearch={showSearch}
      onSearchClose={onSearchClose}
      // define max height if there are lots of rows
      height={rows.length > 10 ? 500 : undefined}
      customRenderers={[
        renderLinkCell,
        renderLinkedWithCell,
        renderSummaryChipCell,
        renderChipCell,
      ]}
    />
  );
};
