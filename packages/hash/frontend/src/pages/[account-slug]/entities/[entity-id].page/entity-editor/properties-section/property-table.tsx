import "@glideapps/glide-data-grid/dist/index.css";
import { useRef } from "react";
import { DataEditorRef } from "@glideapps/glide-data-grid";
import { useRowData } from "./property-table/use-row-data";
import { useGetCellContent } from "./property-table/use-get-cell-content";
import { propertyGridColumns } from "./property-table/constants";
import { useOnCellEdited } from "./property-table/use-on-cell-edited";
import { useEntityEditor } from "../entity-editor-context";
import { GlideGrid } from "../../../../../../components/GlideGlid/glide-grid";
import {
  createHandleHeaderClicked,
  useDrawCell,
  useDrawHeader,
} from "../../../../../../components/GlideGlid/utils";
import { useGridTooltip } from "../../../../../../components/GlideGlid/use-grid-tooltip";
import { renderValueCell } from "./property-table/cells/value-cell";
import { renderDataTypeCell } from "./property-table/cells/data-type-cell";

interface PropertyTableProps {
  showSearch: boolean;
  onSearchClose: () => void;
}

export const PropertyTable = ({
  showSearch,
  onSearchClose,
}: PropertyTableProps) => {
  const gridRef = useRef<DataEditorRef>(null);
  const { propertySort, setPropertySort } = useEntityEditor();
  const rowData = useRowData();
  const { tooltipElement, showTooltip, hideTooltip, withTooltips } =
    useGridTooltip(gridRef);
  const getCellContent = useGetCellContent(rowData, showTooltip, hideTooltip);
  const onCellEdited = useOnCellEdited(rowData);
  const drawCell = useDrawCell();
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
        drawCell={drawCell}
        drawHeader={drawHeader}
        onHeaderClicked={handleHeaderClicked}
        showSearch={showSearch}
        onSearchClose={onSearchClose}
        customRenderers={[withTooltips(renderValueCell), renderDataTypeCell]}
        // define max height if there are lots of rows
        height={rowData.length > 10 ? 500 : undefined}
      />
      {tooltipElement}
    </>
  );
};
