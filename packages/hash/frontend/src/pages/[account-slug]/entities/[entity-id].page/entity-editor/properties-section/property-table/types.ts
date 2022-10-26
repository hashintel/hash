import { PropertyType } from "@blockprotocol/type-system-web";
import { SizedGridColumn } from "@glideapps/glide-data-grid";

export type PropertyRow = PropertyType & {
  value: any;
  propertyTypeBaseUri: string;
  dataTypes: string[];
  required: boolean;
};

export type PropertyColumnKey = Extract<
  keyof PropertyRow,
  "title" | "value" | "dataTypes"
>;

export interface PropertyColumn extends SizedGridColumn {
  id: PropertyColumnKey;
}
