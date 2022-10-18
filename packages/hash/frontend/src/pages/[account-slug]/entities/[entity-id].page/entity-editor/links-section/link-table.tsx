import "@glideapps/glide-data-grid/dist/index.css";
import { GlideGrid } from "../../../../../../components/GlideGlid/glide-grid";
import {
  createHandleHeaderClicked,
  useDrawCell,
  useDrawHeader,
} from "../../../../../../components/GlideGlid/utils";
import { useEntityEditor } from "../entity-editor-context";
import { linkGridColumns } from "./link-table/constants";
import { useGetCellContent } from "./link-table/use-get-cell-content";
import { useRowData } from "./link-table/use-row-data";

export const LinkTable = () => {
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
      height={rowData.length > 10 ? 500 : undefined}
    />
  );
};
