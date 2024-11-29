import {
  ArraySchema as BpArraySchema,
  NumberConstraints,
  StringConstraints,
  ValueLabel,
} from "@blockprotocol/type-system/slim";
import type {
  CustomCell,
  ProvideEditorComponent,
} from "@glideapps/glide-data-grid";

import type { TooltipCellProps } from "../../../../../../../../../components/grid/utils/use-grid-tooltip/types";
import type { PropertyRow } from "../../types";

export interface ValueCellProps extends TooltipCellProps {
  readonly kind: "value-cell";
  propertyRow: PropertyRow;
  readonly: boolean;
}

export type ValueCell = CustomCell<ValueCellProps>;

export type EditorType =
  | "array"
  | "boolean"
  | "mixed"
  | "null"
  | "number"
  | "object"
  | "string";

type MergedNumberSchema = { type: "number" } & Omit<
  NumberConstraints,
  "multipleOf"
> & { multipleOf?: number[] };

type MergedStringSchema = { type: "string" } & Omit<
  StringConstraints,
  "pattern"
> & { pattern?: string[] };

type ConstSchema = { const: string | number | boolean };

type EnumSchema = { enum: (string | number)[] };

type ObjectSchema = { type: "object" };

type NullSchema = { type: "null" };

type BooleanSchema = { type: "boolean" };

type ArraySchema = { type: "array" } & BpArraySchema;

export type MergedValueSchema =
  | MergedNumberSchema
  | MergedStringSchema
  | ConstSchema
  | EnumSchema
  | ObjectSchema
  | NullSchema
  | BooleanSchema
  | ArraySchema;

export type MergedDataTypeSingleSchema = {
  description: string;
  label?: ValueLabel;
} & MergedValueSchema;

export type MergedDataTypeSchema =
  | MergedDataTypeSingleSchema
  | { anyOf: MergedDataTypeSingleSchema[] };

export type OnTypeChange = (type: EditorType) => void;

export type ValueCellEditorComponent = ProvideEditorComponent<ValueCell>;
