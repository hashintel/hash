import "@glideapps/glide-data-grid/dist/index.css";
import { useCallback } from "react";
import { PropertyTableProps } from "./property-table/types";
import { useRowData } from "./property-table/use-row-data";
import { useGetCellContent } from "./property-table/use-get-cell-content";
import { gridColumns } from "./property-table/constants";
import { useOnCellEdited } from "./property-table/use-on-cell-edited";
import { useDrawCell, useDrawHeader } from "./property-table/draw-functions";
import { useEntityEditor } from "./entity-editor-context";
import { GlideGrid } from "../../../../components/GlideGlid/glide-grid";

export const PropertyTable = ({
  showSearch,
  onSearchClose,
}: PropertyTableProps) => {
  const rowData = useRowData();
  const getCellContent = useGetCellContent(rowData);
  const onCellEdited = useOnCellEdited(rowData);
  const drawCell = useDrawCell();
  const drawHeader = useDrawHeader();

  const { propertySort, setPropertySort } = useEntityEditor();

  const handleHeaderClicked = useCallback(
    (col: number) => {
      const key = gridColumns[col]?.id;
      if (!key) {
        return;
      }

      const isSorted = key === propertySort.key;

      setPropertySort({
        key,
        dir: isSorted && propertySort.dir === "asc" ? "desc" : "asc",
      });
    },
    [propertySort, setPropertySort],
  );

  return (
    <GlideGrid
      columns={gridColumns}
      rows={rowData.length}
      getCellContent={getCellContent}
      onCellEdited={onCellEdited}
      drawCell={drawCell}
      drawHeader={drawHeader}
      onHeaderClicked={handleHeaderClicked}
      showSearch={showSearch}
      onSearchClose={onSearchClose}
      // define max height if there are lots of rows
      height={rowData.length > 10 ? 500 : undefined}
    />
  );
};
