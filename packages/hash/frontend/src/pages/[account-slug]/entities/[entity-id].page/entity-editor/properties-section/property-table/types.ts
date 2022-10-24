import { PropertyType } from "@blockprotocol/type-system-web";
import { SizedGridColumn } from "@glideapps/glide-data-grid";

export type PropertyRow = EnrichedPropertyType;

export type EnrichedPropertyType = PropertyType & {
  value: any;
  /** @todo - Correct this, it is a property type BaseUri not an ID (it's unversioned) */
  propertyTypeId: string;
  dataTypes: string[];
  required: boolean;
};

export type PropertyColumnKey = Extract<
  keyof EnrichedPropertyType,
  "title" | "value" | "dataTypes"
>;

export interface PropertyColumn extends SizedGridColumn {
  id: PropertyColumnKey;
}
