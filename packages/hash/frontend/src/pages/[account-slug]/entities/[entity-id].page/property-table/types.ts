import { PropertyType } from "@blockprotocol/type-system-web";

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
