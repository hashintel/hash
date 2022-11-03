import "@glideapps/glide-data-grid/dist/index.css";
import { GlideGrid } from "../../../../../../components/GlideGlid/glide-grid";
import { createHandleHeaderClicked } from "../../../../../../components/GlideGlid/utils/sorting";
import { useDrawCell } from "../../../../../../components/GlideGlid/utils/use-draw-cell";
import { useDrawHeader } from "../../../../../../components/GlideGlid/utils/use-draw-header";
import { useEntityEditor } from "../entity-editor-context";
import { linkGridColumns } from "./link-table/constants";
import { useGetCellContent } from "./link-table/use-get-cell-content";
import { useRowData } from "./link-table/use-row-data";

interface LinkTableProps {
  showSearch: boolean;
  onSearchClose: () => void;
}

export const LinkTable = ({ showSearch, onSearchClose }: LinkTableProps) => {
  const { linkSort, setLinkSort } = useEntityEditor();
  const rowData = useRowData();
  const drawHeader = useDrawHeader(linkSort, linkGridColumns);
  const drawCell = useDrawCell();
  const getCellContent = useGetCellContent(rowData);

  const handleHeaderClicked = createHandleHeaderClicked(
    linkGridColumns,
    linkSort,
    setLinkSort,
  );

  return (
    <GlideGrid
      columns={linkGridColumns}
      rows={rowData.length}
      getCellContent={getCellContent}
      onHeaderClicked={handleHeaderClicked}
      drawHeader={drawHeader}
      drawCell={drawCell}
      showSearch={showSearch}
      onSearchClose={onSearchClose}
      // define max height if there are lots of rows
      height={rowData.length > 10 ? 500 : undefined}
    />
  );
};
