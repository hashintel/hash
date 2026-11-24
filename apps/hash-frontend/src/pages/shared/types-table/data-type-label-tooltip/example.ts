import { getDataTypeLabelPreview } from "../shared/data-type-label-preview";
import { getNumberExample } from "./example/number";
import { getStringExample } from "./example/string";

import type { JsonValue } from "@blockprotocol/core";
import type {
  ArrayItemsSchema,
  DataType,
  DataTypeWithMetadata,
  SingleValueSchema,
  ValueLabel,
  VersionedUrl,
} from "@blockprotocol/type-system";

type Constraint = { schema: SingleValueSchema; depth: number };
type Example = { value: JsonValue; schema: SingleValueSchema };

const nearestLabel = (constraints: Constraint[]): ValueLabel | undefined => {
  const labeled = constraints.filter(
    ({ schema }) =>
      schema.label &&
      (schema.label.left !== undefined || schema.label.right !== undefined),
  );
  const depth = Math.min(...labeled.map((constraint) => constraint.depth));
  const nearest = labeled.filter((constraint) => constraint.depth === depth);
  const first = nearest[0]?.schema.label;
  return nearest.every(
    ({ schema }) =>
      schema.label?.left === first?.left &&
      schema.label?.right === first?.right,
  )
    ? first
    : undefined;
};

const sample = (constraints: Constraint[], index = 0): Example | undefined => {
  const first = constraints[0]?.schema;
  if (!first || constraints.some(({ schema }) => schema.type !== first.type)) {
    return undefined;
  }
  const label = nearestLabel(constraints);
  const schemas = constraints.map(({ schema }) => schema);
  switch (first.type) {
    case "number": {
      const value = getNumberExample(
        schemas.filter((schema) => schema.type === "number"),
        index,
      );
      return value === undefined
        ? undefined
        : { value, schema: { type: "number", label } };
    }
    case "string": {
      const value = getStringExample(
        schemas.filter((schema) => schema.type === "string"),
      );
      return value === undefined
        ? undefined
        : { value, schema: { type: "string", label } };
    }
    case "boolean":
      return { value: index % 2 === 0, schema: { type: "boolean", label } };
    case "null":
      return { value: null, schema: { type: "null", label } };
    case "object":
      return { value: { name: "Example" }, schema: { type: "object", label } };
    case "array": {
      const arrays = schemas.filter((schema) => schema.type === "array");
      const lengths = arrays.flatMap((schema) =>
        schema.items === false ? [schema.prefixItems?.length ?? 0] : [],
      );
      const minimum = Math.max(
        0,
        ...arrays.map((schema) =>
          schema.items === false
            ? (schema.prefixItems?.length ?? 0)
            : (schema.minItems ?? 0),
        ),
      );
      const maximum = Math.min(
        8,
        ...arrays.map((schema) =>
          schema.items === false
            ? (schema.prefixItems?.length ?? 0)
            : (schema.maxItems ?? Infinity),
        ),
      );
      if (
        minimum > maximum ||
        lengths.some((length) => length !== lengths[0])
      ) {
        return undefined;
      }
      const length = lengths[0] ?? Math.max(minimum, Math.min(2, maximum));
      const value: JsonValue[] = [];
      const prefixItems: ArrayItemsSchema[] = [];
      for (let itemIndex = 0; itemIndex < length; itemIndex++) {
        const items = constraints.flatMap(({ schema, depth }) => {
          if (schema.type !== "array") {
            return [];
          }
          const item =
            schema.items === false
              ? schema.prefixItems?.[itemIndex]
              : schema.items;
          return item ? [{ schema: item, depth }] : [];
        });
        const item = sample(
          items.length ? items : [{ schema: { type: "number" }, depth: 0 }],
          itemIndex,
        );
        if (
          !item ||
          (item.schema.type !== "number" &&
            item.schema.type !== "string" &&
            item.schema.type !== "boolean")
        ) {
          return undefined;
        }
        value.push(item.value);
        prefixItems.push(item.schema);
      }
      const [head, ...tail] = prefixItems;
      return {
        value,
        schema: {
          type: "array",
          items: false,
          prefixItems: head ? [head, ...tail] : undefined,
          label,
        },
      };
    }
  }
};

export const getDataTypeLabelExample = (
  schema: DataType,
  dataTypes: Record<VersionedUrl, DataTypeWithMetadata>,
) => {
  const queue = [{ schema, depth: 0 }];
  const visited = new Set<VersionedUrl>();
  let options: Constraint[][] = [[]];
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (!current || visited.has(current.schema.$id)) {
      continue;
    }
    visited.add(current.schema.$id);
    if (visited.size > 64) {
      return undefined;
    }
    const branches =
      "anyOf" in current.schema
        ? current.schema.anyOf.slice(0, 8)
        : [current.schema];
    const next: Constraint[][] = [];
    for (const option of options) {
      for (const branch of branches) {
        if (!option[0] || option[0].schema.type === branch.type) {
          next.push([
            ...option,
            {
              schema: {
                ...branch,
                label: branch.label ?? current.schema.label,
              },
              depth: current.depth,
            },
          ]);
        }
        if (next.length >= 64) {
          break;
        }
      }
      if (next.length >= 64) {
        break;
      }
    }
    options = next;
    for (const { $ref } of current.schema.allOf ?? []) {
      const parent = dataTypes[$ref]?.schema;
      if (!parent) {
        return undefined;
      }
      if (!visited.has($ref)) {
        if (queue.length >= 128) {
          return undefined;
        }
        queue.push({ schema: parent, depth: current.depth + 1 });
      }
    }
  }
  for (const constraints of options) {
    const example = sample(constraints);
    if (example) {
      return getDataTypeLabelPreview(
        {
          $id: schema.$id,
          $schema: schema.$schema,
          kind: "dataType",
          title: schema.title,
          description: schema.description,
          ...example.schema,
        },
        {},
        example.value,
      );
    }
  }
  return undefined;
};
