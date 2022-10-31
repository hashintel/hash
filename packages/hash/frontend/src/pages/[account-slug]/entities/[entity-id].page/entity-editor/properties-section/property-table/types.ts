import { PropertyType } from "@blockprotocol/type-system-web";
import { SizedGridColumn } from "@glideapps/glide-data-grid";
import { VerticalLineDir } from "../../../../../../../components/GlideGlid/utils";

export type PropertyRow = PropertyType & {
  rowId: string;
  value: any;
  dataTypes: string[];
  required: boolean;
  children: PropertyRow[];
  depth: number;
  indent: number;
  verticalLinesForEachIndent: VerticalLineDir[];
  propertyKeyChain: string[];
};

export type PropertyColumnKey = Extract<
  keyof PropertyRow,
  "title" | "value" | "dataTypes"
>;

export interface PropertyColumn extends SizedGridColumn {
  id: PropertyColumnKey;
}
