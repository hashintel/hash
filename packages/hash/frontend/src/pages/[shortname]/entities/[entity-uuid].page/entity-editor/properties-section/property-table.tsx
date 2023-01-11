import { DataEditorRef } from "@glideapps/glide-data-grid";
import { useMemo, useRef } from "react";

import { Grid } from "../../../../../../components/grid/grid";
import { useGridTooltip } from "../../../../../../components/grid/utils/use-grid-tooltip";
import { useEntityEditor } from "../entity-editor-context";
import { createRenderChangeTypeCell } from "./property-table/cells/change-type-cell";
import { renderChipCell } from "./property-table/cells/chip-cell";
import { createRenderPropertyNameCell } from "./property-table/cells/property-name-cell";
import { renderSummaryChipCell } from "./property-table/cells/summary-chip-cell";
import { renderValueCell } from "./property-table/cells/value-cell";
import { propertyGridColumns } from "./property-table/constants";
import { useCreateGetCellContent } from "./property-table/use-create-get-cell-content";
import { useCreateOnCellEdited } from "./property-table/use-create-on-cell-edited";
import { useRows } from "./property-table/use-rows";

interface PropertyTableProps {
  showSearch: boolean;
  onSearchClose: () => void;
}

export const PropertyTable = ({
  showSearch,
  onSearchClose,
}: PropertyTableProps) => {
  const gridRef = useRef<DataEditorRef>(null);
  const { togglePropertyExpand, propertyExpandStatus } = useEntityEditor();
  const [rows, sortAndFlattenRows] = useRows();
  const { tooltipElement, showTooltip, hideTooltip } = useGridTooltip(gridRef);
  const createGetCellContent = useCreateGetCellContent(
    showTooltip,
    hideTooltip,
  );
  const createOnCellEdited = useCreateOnCellEdited();

  const customRenderers = useMemo(
    () => [
      renderValueCell,
      renderChipCell,
      createRenderPropertyNameCell(togglePropertyExpand, propertyExpandStatus),
      renderSummaryChipCell,
      createRenderChangeTypeCell(gridRef),
    ],
    [togglePropertyExpand, propertyExpandStatus],
  );

  return (
    <>
      <Grid
        gridRef={gridRef}
        columns={propertyGridColumns}
        createGetCellContent={createGetCellContent}
        createOnCellEdited={createOnCellEdited}
        rows={rows}
        showSearch={showSearch}
        onSearchClose={onSearchClose}
        customRenderers={customRenderers}
        sortRows={sortAndFlattenRows}
        // define max height if there are lots of rows
        height={rows.length > 10 ? 500 : undefined}
      />
      {tooltipElement}
    </>
  );
};
