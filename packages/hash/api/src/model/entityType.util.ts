import { JSONSchema7 } from "json-schema";
import { EntityType } from ".";

export const JSON_SCHEMA_VERSION =
  "https://json-schema.org/draft/2019-09/schema";

export class SchemaTypeMismatch extends Error {
  constructor(msg: string) {
    super(msg);
    Object.setPrototypeOf(this, SchemaTypeMismatch.prototype);
  }
}

export type PropertyGroup = {
  parents: PropertyGroup[];
  $id?: string;
  properties: Property[];
};

export type Property = {
  name: string;
  type: string;
  format?: string;
  description?: string;
  otherFields: Partial<JSONSchema7>;
};

const CONSTRAINT_RE = /.*(min|max).*/i;

const maximizeConstraint = Math.max;
const minimizeConstraint = Math.min;

type Constraint =
  | "exclusiveMaximum"
  | "exclusiveMinimum"
  | "maximum"
  | "minimum"
  | "maxItems"
  | "minItems"
  | "maxLength"
  | "minLength"
  | "maxProperties"
  | "minProperties";

const propertyConstraintMerging: Record<
  Constraint | string,
  (...values: number[]) => number
> = {
  exclusiveMaximum: minimizeConstraint,
  exclusiveMinimum: maximizeConstraint,
  maximum: minimizeConstraint,
  minimum: maximizeConstraint,
  maxItems: minimizeConstraint,
  minItems: maximizeConstraint,
  maxLength: minimizeConstraint,
  minLength: maximizeConstraint,
  maxProperties: minimizeConstraint,
  minProperties: maximizeConstraint,
} as const;

function extractProperties(schema: JSONSchema7): PropertyGroup {
  const properties: Property[] = [];
  for (const [field, value] of Object.entries(schema ?? {})) {
    const { type, format, description, ...otherFields } = value as Record<
      string,
      any
    >;
    properties.push({
      name: field,
      type,
      format,
      description,
      otherFields,
    });
  }
  return { $id: schema.$id, parents: [], properties };
}

const validationConstraintPairs = (
  constraints: Record<string, number>,
): string[] => {
  const constraintErrors: string[] = [];

  const pairs: [Constraint, Constraint][] = [
    ["exclusiveMaximum", "exclusiveMinimum"],
    ["maximum", "minimum"],
    ["maxItems", "minItems"],
    ["maxLength", "minLength"],
    ["maxProperties", "minProperties"],
  ];

  for (const [maxKey, minKey] of pairs) {
    const max = constraints[maxKey];
    const min = constraints[minKey];

    if (max !== undefined && min !== undefined) {
      if (max < min) {
        constraintErrors.push(
          `Constraint '${minKey}' (${min}) to '${maxKey}' (${max}) defines a negative interval.`,
        );
      }
    }
  }

  return constraintErrors;
};

type PropertyWithConstraint = {
  property: Property;
  numberConstraints: Record<string, number>;
};

function validatePropertyType(
  property: Property,
  seenProperty: PropertyWithConstraint,
): string[] {
  if (property.type && property.type !== seenProperty.property.type) {
    return [
      `Type mismatch on "${property.name}". Got "${property.type}" expected "${seenProperty.property.type}"`,
    ];
  }

  return [];
}

function validateProperties(
  entityType: JSONSchema7,
  existingErrors?: string[],
  alreadySeen?: Map<string, PropertyWithConstraint>,
) {
  const seen = alreadySeen ?? new Map();
  const errors = existingErrors ?? [];

  const propertyGroup = extractProperties(entityType);
  for (const property of propertyGroup.properties) {
    const constraints: [string, number][] = Object.entries(
      property.otherFields,
      // Assumption is being made here about all "min" and "max" constraints always having number values
    ).filter((prop): prop is [string, number] => CONSTRAINT_RE.test(prop[0]));

    if (seen.has(property.name)) {
      const seenProperty = seen.get(property.name)!;

      errors.push(...validatePropertyType(property, seenProperty));

      for (const [fieldName, fieldValue] of constraints) {
        const constraintNarrow = propertyConstraintMerging[fieldName];
        if (constraintNarrow) {
          const narrowedConstraint = constraintNarrow(
            fieldValue,
            seenProperty.numberConstraints[fieldName],
          );

          seenProperty.numberConstraints[fieldName] = narrowedConstraint;
        }
      }
      errors.push(...validationConstraintPairs(seenProperty.numberConstraints));
    } else {
      seen.set(property.name, {
        property,
        numberConstraints: Object.fromEntries(constraints),
      });
    }
  }
}

/**
 * Given a list of all properties, check if any duplicates are present by the property name.
 * @param properties list of properties to duplicate check
 * @returns a list of type-mismatch errors. Does not throw an exception.
 */
export const entityTypePropertyKeyValidator = (
  ...schemas: (EntityType | JSONSchema7)[]
): string[] => {
  const seen: Map<string, PropertyWithConstraint> = new Map();
  const errors: string[] = [];

  // Iterate all props, check for duplicates and throw an error if types mismatch
  for (const schema of schemas) {
    if (schema instanceof EntityType) {
      validateProperties(schema.properties, errors, seen);
    } else {
      validateProperties(schema, errors, seen);
    }
  }

  return errors;
};

export const getSchemaAllOfRefs = (schema: JSONSchema7) =>
  schema.allOf
    ?.filter(
      (allOfEntry): allOfEntry is { $ref: string } =>
        typeof allOfEntry === "object" && "$ref" in allOfEntry,
    )
    .map(({ $ref }) => $ref) ?? [];
