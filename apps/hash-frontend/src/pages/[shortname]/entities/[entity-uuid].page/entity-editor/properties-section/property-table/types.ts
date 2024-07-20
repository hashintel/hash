import type { SizedGridColumn } from "@glideapps/glide-data-grid";
import type { DataTypeWithMetadata } from "@local/hash-graph-types/ontology";

import type { VerticalIndentationLineDir } from "../../../../../../../components/grid/utils/draw-vertical-indentation-line";

export interface PropertyRow {
  title: string;
  rowId: string;
  value: unknown;
  expectedTypes: DataTypeWithMetadata["schema"][];
  isArray: boolean;
  required: boolean;
  children: PropertyRow[];
  depth: number;
  indent: number;
  verticalLinesForEachIndent: VerticalIndentationLineDir[];
  propertyKeyChain: string[];
  maxItems?: number;
  minItems?: number;
}

export type PropertyColumnKey = Extract<
  keyof PropertyRow,
  "title" | "value" | "expectedTypes"
>;

export interface PropertyColumn extends SizedGridColumn {
  id: PropertyColumnKey;
}
