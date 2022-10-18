import "@glideapps/glide-data-grid/dist/index.css";
import { PropertyTableProps } from "./property-table/types";
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

export const PropertyTable = ({
  showSearch,
  onSearchClose,
}: PropertyTableProps) => {
  const { propertySort, setPropertySort } = useEntityEditor();
  const rowData = useRowData();
  const getCellContent = useGetCellContent(rowData);
  const onCellEdited = useOnCellEdited(rowData);
  const drawCell = useDrawCell();
  const drawHeader = useDrawHeader(propertySort, propertyGridColumns);

  const handleHeaderClicked = createHandleHeaderClicked(
    propertyGridColumns,
    propertySort,
    setPropertySort,
  );

  return (
    <GlideGrid
      columns={propertyGridColumns}
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
