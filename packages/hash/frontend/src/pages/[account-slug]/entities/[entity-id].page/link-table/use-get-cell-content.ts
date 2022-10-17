import { GridCell, GridCellKind, Item } from "@glideapps/glide-data-grid";
import { useCallback } from "react";
import { useEntityEditor } from "../entity-editor-context";
import { linkGridIndexes } from "./constants";
import { LinkRow } from "./types";

export const useGetCellContent = (rowData: LinkRow[]) => {
  const { linkSort } = useEntityEditor();

  const getCellContent = useCallback(
    ([col, row]: Item): GridCell => {
      const link = rowData[row];

      if (!link) {
        throw new Error();
      }

      const linkKey = linkGridIndexes[col];

      if (!linkKey) {
        throw new Error();
      }

      const value = link[linkKey];

      return {
        kind: GridCellKind.Text,
        data: value,
        displayData: value,
        allowOverlay: false,
      };
    },
    /**
     * @todo check why grid is not updating without adding `linkSort` as dependency
     * rowData is already depending on `linkSort`
     * */
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowData, linkSort],
  );

  return getCellContent;
};
