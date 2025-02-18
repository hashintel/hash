import type {
  DataType,
  JsonValue,
  SingleValueConstraints,
  StringFormat,
} from "@blockprotocol/type-system";

export type InheritedConstraint<T> = {
  from: DataType;
  value: T;
};

export type InheritedConstraints = {
  type?: InheritedConstraint<
    Extract<
      /**
       * @todo H-4065, H-4066: support array and tuple types (type: "array")
       */
      SingleValueConstraints["type"],
      "string" | "number" | "boolean" | "null" | "object"
    >
  >;
  minLength?: InheritedConstraint<number>;
  maxLength?: InheritedConstraint<number>;
  minimum?: InheritedConstraint<{ value: number; exclusive: boolean }>;
  maximum?: InheritedConstraint<{ value: number; exclusive: boolean }>;
  multipleOf?: InheritedConstraint<number>[];
  pattern?: InheritedConstraint<string>[];
  format?: InheritedConstraint<StringFormat>;
  enum?: InheritedConstraint<[string, ...string[]] | [number, ...number[]]>;
  const?: InheritedConstraint<JsonValue>;
};
