import { PropertyType } from "@blockprotocol/type-system-web";
import { SizedGridColumn } from "@glideapps/glide-data-grid";

export type PropertyRow = {
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

export interface PropertyColumn extends SizedGridColumn {
  id: keyof PropertyRow;
}
