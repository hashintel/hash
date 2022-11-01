import "@glideapps/glide-data-grid/dist/index.css";
import { useRef } from "react";
import { DataEditorRef } from "@glideapps/glide-data-grid";
import { useRowData } from "./property-table/use-row-data";
import { useGetCellContent } from "./property-table/use-get-cell-content";
import { propertyGridColumns } from "./property-table/constants";
import { useOnCellEdited } from "./property-table/use-on-cell-edited";
import { useEntityEditor } from "../entity-editor-context";
import { GlideGrid } from "../../../../../../components/GlideGlid/glide-grid";
import { useGridTooltip } from "../../../../../../components/GlideGlid/utils/use-grid-tooltip";
import { renderValueCell } from "./property-table/cells/value-cell";
import { renderDataTypeCell } from "./property-table/cells/data-type-cell";
import { createRenderPropertyNameCell } from "./property-table/cells/property-name-cell";
import { useDrawHeader } from "../../../../../../components/GlideGlid/utils/use-draw-header";
import { createHandleHeaderClicked } from "../../../../../../components/GlideGlid/utils/sorting";

interface PropertyTableProps {
  showSearch: boolean;
  onSearchClose: () => void;
}

export const PropertyTable = ({
  showSearch,
  onSearchClose,
}: PropertyTableProps) => {
  const gridRef = useRef<DataEditorRef>(null);
  const {
    propertySort,
    setPropertySort,
    togglePropertyExpand,
    propertyExpandStatus,
  } = useEntityEditor();
  const rowData = useRowData();
  const { tooltipElement, showTooltip, hideTooltip, withTooltips } =
    useGridTooltip(gridRef);
  const getCellContent = useGetCellContent(rowData, showTooltip, hideTooltip);
  const onCellEdited = useOnCellEdited(rowData);
  const drawHeader = useDrawHeader(propertySort, propertyGridColumns);

  const handleHeaderClicked = createHandleHeaderClicked(
    propertyGridColumns,
    propertySort,
    setPropertySort,
  );

  return (
    <>
      <GlideGrid
        ref={gridRef}
        columns={propertyGridColumns}
        rows={rowData.length}
        getCellContent={getCellContent}
        onCellEdited={onCellEdited}
        drawHeader={drawHeader}
        onHeaderClicked={handleHeaderClicked}
        showSearch={showSearch}
        onSearchClose={onSearchClose}
        customRenderers={[
          withTooltips(renderValueCell),
          renderDataTypeCell,
          createRenderPropertyNameCell(
            togglePropertyExpand,
            propertyExpandStatus,
          ),
        ]}
        // define max height if there are lots of rows
        height={rowData.length > 10 ? 500 : undefined}
      />
      {tooltipElement}
    </>
  );
};
