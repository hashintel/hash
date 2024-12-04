import type { ClosedDataType } from "@blockprotocol/type-system";
import type { SizedGridColumn } from "@glideapps/glide-data-grid";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type {
  PropertyMetadata,
  PropertyPath,
} from "@local/hash-graph-types/entity";

import type { VerticalIndentationLineDir } from "../../../../../../../components/grid/utils/draw-vertical-indentation-line";

export type PropertyRow = {
  children: PropertyRow[];
  depth: number;
  indent: number;
  isArray: boolean;
  isSingleUrl: boolean;
  maxItems?: number;
  minItems?: number;
  permittedDataTypes: ClosedDataType[];
  propertyKeyChain: PropertyPath;
  required: boolean;
  rowId: string;
  setPropertyMetadata: Entity["setPropertyMetadata"];
  title: string;
  value: unknown;
  valueMetadata?: PropertyMetadata;
  verticalLinesForEachIndent: VerticalIndentationLineDir[];
};

export type PropertyColumnKey = Extract<
  keyof PropertyRow,
  "title" | "value" | "permittedDataTypes"
>;

export interface PropertyColumn extends SizedGridColumn {
  id: PropertyColumnKey;
}
