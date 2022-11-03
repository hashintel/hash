import { SizedGridColumn } from "@glideapps/glide-data-grid";
import { VerticalIndentationLineDir } from "../../../../../../../components/GlideGlid/utils/draw-vertical-indentation-line";

export type PropertyRow = {
  title: string;
  rowId: string;
  value: unknown;
  dataTypes: string[];
  required: boolean;
  children: PropertyRow[];
  depth: number;
  indent: number;
  verticalLinesForEachIndent: VerticalIndentationLineDir[];
  propertyKeyChain: string[];
};

export type PropertyColumnKey = Extract<
  keyof PropertyRow,
  "title" | "value" | "dataTypes"
>;

export interface PropertyColumn extends SizedGridColumn {
  id: PropertyColumnKey;
}
