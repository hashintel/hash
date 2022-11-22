import { GlideGrid } from "../../../../../../components/GlideGlid/glide-grid";
import { useDrawCell } from "../../../../../../components/GlideGlid/utils/use-draw-cell";
import { linkGridColumns } from "./link-table/constants";
import { useCreateGetCellContent } from "./link-table/use-create-get-cell-content";
import { useRowData } from "./link-table/use-row-data";

interface LinkTableProps {
  showSearch: boolean;
  onSearchClose: () => void;
}

export const LinkTable = ({ showSearch, onSearchClose }: LinkTableProps) => {
  const rowData = useRowData();
  const drawCell = useDrawCell();
  const createGetCellContent = useCreateGetCellContent();

  return (
    <GlideGrid
      columns={linkGridColumns}
      rowData={rowData}
      createGetCellContent={createGetCellContent}
      drawCell={drawCell}
      showSearch={showSearch}
      onSearchClose={onSearchClose}
      // define max height if there are lots of rows
      height={rowData.length > 10 ? 500 : undefined}
    />
  );
};
