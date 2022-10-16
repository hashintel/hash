import { PropertyType } from "@blockprotocol/type-system-web";
import { SizedGridColumn } from "@glideapps/glide-data-grid";
import { TableSortType } from "../../../../../components/GlideGlid/utils";

export type PropertyTableRow = {
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

export interface PropertyTableGridColumn extends SizedGridColumn {
  id: keyof PropertyTableRow;
}

export interface PropertySort {
  key: keyof PropertyTableRow;
  dir: TableSortType;
}
