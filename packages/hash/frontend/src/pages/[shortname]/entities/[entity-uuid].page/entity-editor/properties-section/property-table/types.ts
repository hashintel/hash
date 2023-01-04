import { SizedGridColumn } from "@glideapps/glide-data-grid";

import { VerticalIndentationLineDir } from "../../../../../../../components/grid/utils/draw-vertical-indentation-line";

export type PropertyRow = {
  title: string;
  rowId: string;
  value: unknown;
  expectedTypes: string[];
  isArray: boolean;
  required: boolean;
  children: PropertyRow[];
  depth: number;
  indent: number;
  verticalLinesForEachIndent: VerticalIndentationLineDir[];
  propertyKeyChain: string[];
  maxItems?: number;
  minItems?: number;
};

export type PropertyColumnKey = Extract<
  keyof PropertyRow,
  "title" | "value" | "expectedTypes"
>;

export interface PropertyColumn extends SizedGridColumn {
  id: PropertyColumnKey;
}
