import type { DataEditorRef } from "@glideapps/glide-data-grid";
import { useMemo, useRef } from "react";

import { Grid } from "../../../../../components/grid/grid";
import { useGridTooltip } from "../../../../../components/grid/utils/use-grid-tooltip";
import { createRenderChipCell } from "../../../chip-cell";
import { useEntityEditor } from "../entity-editor-context";
import { renderSummaryChipCell } from "../shared/summary-chip-cell";
import { createRenderChangeTypeCell } from "./property-table/cells/change-type-cell";
import { createRenderPropertyNameCell } from "./property-table/cells/property-name-cell";
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
      createRenderChipCell(),
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
        dataLoading={false}
        rows={rows}
        showSearch={showSearch}
        onSearchClose={onSearchClose}
        customRenderers={customRenderers}
        sortableColumns={["title", "value", "permittedDataTypes"]}
        sortRows={sortAndFlattenRows}
        height={rows.length > 10 ? 500 : undefined}
      />
      {tooltipElement}
    </>
  );
};
