import { PropertyType } from "@blockprotocol/type-system-web";
import { SizedGridColumn } from "@glideapps/glide-data-grid";

export type Row = {
  title: string;
  value: any;
  dataTypes: string[];
  propertyTypeId: string;
};

export type EnrichedPropertyType = PropertyType & {
  value: any;
  propertyTypeId: string;
  dataTypes: string[];
};

export interface PropertyTableProps {
  showSearch?: boolean;
  onSearchClose?: () => void;
}

export interface CustomGridColumn extends SizedGridColumn {
  id: keyof Row;
}

export type TableSortType = "asc" | "desc";

export interface PropertySort {
  key: keyof Row;
  dir: TableSortType;
}
