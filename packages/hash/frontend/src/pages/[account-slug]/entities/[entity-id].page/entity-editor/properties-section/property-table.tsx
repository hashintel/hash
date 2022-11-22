import { useMemo, useRef } from "react";
import { DataEditorRef } from "@glideapps/glide-data-grid";
import { useRowData } from "./property-table/use-row-data";
import { useCreateGetCellContent } from "./property-table/use-create-get-cell-content";
import { propertyGridColumns } from "./property-table/constants";
import { useOnCellEdited } from "./property-table/use-on-cell-edited";
import { useEntityEditor } from "../entity-editor-context";
import { useGridTooltip } from "../../../../../../components/grid/utils/use-grid-tooltip";
import { renderValueCell } from "./property-table/cells/value-cell";
import { renderChipCell } from "./property-table/cells/chip-cell";
import { createRenderPropertyNameCell } from "./property-table/cells/property-name-cell";
import { renderSummaryChipCell } from "./property-table/cells/summary-chip-cell";
import { Grid } from "../../../../../../components/grid/grid";

interface PropertyTableProps {
  showSearch: boolean;
  onSearchClose: () => void;
}

export const PropertyTable = ({
  showSearch,
  onSearchClose,
}: PropertyTableProps) => {
  const tableRef = useRef<DataEditorRef>(null);
  const { togglePropertyExpand, propertyExpandStatus } = useEntityEditor();
  const [rowData, sortAndFlattenRowData] = useRowData();
  const { tooltipElement, showTooltip, hideTooltip } = useGridTooltip(tableRef);
  const createGetCellContent = useCreateGetCellContent(
    showTooltip,
    hideTooltip,
  );
  const onCellEdited = useOnCellEdited(rowData);

  const customRenderers = useMemo(
    () => [
      renderValueCell,
      renderChipCell,
      createRenderPropertyNameCell(togglePropertyExpand, propertyExpandStatus),
      renderSummaryChipCell,
    ],
    [togglePropertyExpand, propertyExpandStatus],
  );

  return (
    <>
      <Grid
        tableRef={tableRef}
        columns={propertyGridColumns}
        createGetCellContent={createGetCellContent}
        onCellEdited={onCellEdited}
        rowData={rowData}
        showSearch={showSearch}
        onSearchClose={onSearchClose}
        customRenderers={customRenderers}
        sortRowData={sortAndFlattenRowData}
        // define max height if there are lots of rows
        height={rowData.length > 10 ? 500 : undefined}
      />
      {tooltipElement}
    </>
  );
};
