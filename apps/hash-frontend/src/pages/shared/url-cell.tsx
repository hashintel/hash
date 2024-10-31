import type { CustomCell, CustomRenderer } from "@glideapps/glide-data-grid";
import { GridCellKind } from "@glideapps/glide-data-grid";

import { getCellHorizontalPadding } from "../../components/grid/utils";
import { drawUrlAsLink } from "../../components/grid/utils/draw-url-as-link";

export interface UrlCellProps {
  readonly kind: "url-cell";
  url: string;
}

export type UrlCell = CustomCell<UrlCellProps>;

export const createRenderUrlCell = (params?: {
  firstColumnLeftPadding?: number;
}): CustomRenderer<UrlCell> => ({
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is UrlCell =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cell.data as any).kind === "url-cell",
  draw: (args, cell) => {
    const { firstColumnLeftPadding } = params ?? {};
    const { rect } = args;
    const { url } = cell.data;

    const columnPadding =
      typeof firstColumnLeftPadding !== "undefined" && args.col === 1
        ? firstColumnLeftPadding
        : getCellHorizontalPadding();

    const left = rect.x + columnPadding;

    drawUrlAsLink({
      args,
      left,
      url,
    });
  },
  onClick: (args) => {
    window.open(args.cell.data.url, "_blank");
    return undefined;
  },
});
