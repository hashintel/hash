import { SizedGridColumn } from "@glideapps/glide-data-grid";
import { TableSortType } from "../../../../../components/GlideGlid/utils";

export type LinkTableRow = {
  type: string;
  linkedWith: string;
  relationShip: string;
  expectedEntityType: string;
  linkId: string;
};

export interface LinkTableGridColumn extends SizedGridColumn {
  id: keyof LinkTableRow;
}

export interface LinkSort {
  key: keyof LinkTableRow;
  dir: TableSortType;
}
