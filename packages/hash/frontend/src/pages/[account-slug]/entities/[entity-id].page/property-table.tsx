import { DataEditor } from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { PropertyTableProps } from "./property-table/types";
import { useRowData } from "./property-table/use-row-data";
import { useGlideGridTheme } from "./property-table/use-grid-theme";
import { useGetCellContent } from "./property-table/use-get-cell-content";
import { gridColumns } from "./property-table/constants";
import { useOnCellEdited } from "./property-table/use-on-cell-edited";
import { useDrawCell, useDrawHeader } from "./property-table/draw-functions";

export const PropertyTable = ({
  showSearch,
  onSearchClose,
}: PropertyTableProps) => {
  const gridTheme = useGlideGridTheme();
  const rowData = useRowData();
  const getCellContent = useGetCellContent(rowData);
  const onCellEdited = useOnCellEdited(rowData);
  const drawCell = useDrawCell();
  const drawHeader = useDrawHeader();

  return (
    <>
      <DataEditor
        /** functionality */
        columns={gridColumns}
        rows={rowData.length}
        getCellContent={getCellContent}
        onCellEdited={onCellEdited}
        drawCell={drawCell}
        drawHeader={drawHeader}
        /** behavior */
        showSearch={showSearch}
        onSearchClose={onSearchClose}
        getCellsForSelection
        rangeSelect="cell"
        columnSelect="none"
        smoothScrollX
        smoothScrollY
        /** styling  */
        theme={gridTheme}
        width="100%"
        // define max height if there are lots of rows
        height={rowData.length > 10 ? 500 : undefined}
        headerHeight={42}
        rowHeight={42}
        drawFocusRing={false}
      />
      <div
        id="portal"
        style={{ position: "fixed", left: 0, top: 0, zIndex: 9999 }}
      />
    </>
  );
};
