import type { DataType, VersionedUrl } from "@blockprotocol/type-system";
import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import { useDataTypesContext } from "../data-types-context";
import { NumberConstraints } from "./data-type-constraints/number-constraints";
import { StringConstraints } from "./data-type-constraints/string-constraints";
import type { InheritedConstraints } from "./data-type-constraints/types";
import type { DataTypeFormData } from "./data-type-form";

export const DataTypeConstraints = ({
  isReadOnly,
}: { isReadOnly: boolean }) => {
  const { control } = useFormContext<DataTypeFormData>();

  const { dataTypes } = useDataTypesContext();

  const allOf = useWatch({ control, name: "allOf" });

  const inheritedConstraints = useMemo(() => {
    if (!dataTypes) {
      return {};
    }

    const narrowedConstraints: InheritedConstraints = {};

    const parentsByVersionedUrl: Record<VersionedUrl, DataType> = {};

    const allOfStack = [...allOf];

    /**
     * We're going breadth-first through the inheritance tree, starting with the direct parents.
     * This means that we'll come to more distant ancestors later.
     * This will be important for deciding which ancestors we mark constraints as coming 'from'.
     */
    while (allOfStack.length > 0) {
      const parentVersionedUrl = allOfStack.pop()!;

      /**
       * Ignore the top level value type. It has no constraints, and its type is everything.
       * This should be the last item in the stack. All the primitive types (e.g. Text, Number) inherit from Value,
       * and everything must inherit (directly or indirectly) from one of the primitive types.
       */
      if (parentVersionedUrl === blockProtocolDataTypes.value.dataTypeId) {
        continue;
      }

      const parent = dataTypes[parentVersionedUrl];

      if (!parent) {
        throw new Error(`Parent data type not found: ${parentVersionedUrl}`);
      }

      if (parentsByVersionedUrl[parentVersionedUrl]) {
        continue;
      }

      const { schema: parentSchema } = parent;

      if ("anyOf" in parentSchema) {
        /**
         * @todo H-4067: Support anyOf constraints (e.g. data types which can be 'string' or 'number')
         */
        continue;
      }

      if (parentSchema.type === "array") {
        /**
         * @todo H-4065, H-4066: support array and tuple types
         */
        continue;
      }

      /**
       * We keep overwriting 'type' because we want it 'from' the earliest ancestor, which should be one of Text, Number, Boolean, etc,
       * other than the generic top-level Value type which we've already ignored.
       * We assume that there aren't ancestors with _different_ types, as this would be an unsatisfiable data type.
       * Because we're going breadth-first through the inheritance tree, Text, Number etc should always be the last handled.
       */
      narrowedConstraints.type = {
        value: parentSchema.type,
        from: parentSchema,
      };

      if ("const" in parentSchema) {
        /**
         * The Graph will not reject a child data type which (pointlessly) repeats a const from a parent,
         * so we want to make sure we catch the earliest one as the 'true' origin of the constraint.
         * Therefore we keep overwriting it as we encounter a 'const' in earlier ancestors.
         *
         * The Graph will _reject_ children which define a different 'const' to a parent, so we don't need to handle that.
         */
        narrowedConstraints.const = {
          value: parentSchema.const,
          from: parentSchema,
        };

        /**
         * Don't bother looking at any other constraints because a 'const' makes them pointless.
         * If there are any in the tree, they are now redundant, and would be confusing to show.
         */
        continue;
      }

      if ("enum" in parentSchema) {
        if (
          !narrowedConstraints.enum ||
          new Set<number | string>(narrowedConstraints.enum.value).size ===
            new Set<number | string>(parentSchema.enum).size
        ) {
          /**
           * A child may validly define an enum which is a subset of a parent's enum.
           * It may also validly (but pointlessly) repeat a parent's enum.
           * If we encounter an enum of the same size as already set, we overwrite where it's 'from',
           * on the basis that the one we saw earlier was just pointlessly repeating this parent's.
           *
           * It's also technically possible that two ancestors on the same level will repeat an enum,
           * in which case we'll show it as being 'from' whichever we encountered last.
           */
          narrowedConstraints.enum = {
            value: parentSchema.enum,
            from: parentSchema,
          };
        }

        /**
         * Don't bother looking at any other constraints because an enum makes them pointless.
         */
        continue;
      }

      switch (parentSchema.type) {
        case "string": {
          for (const constraint of ["minLength", "maxLength"] as const) {
            if (
              typeof parentSchema[constraint] !== "undefined" &&
              /**
               * If the constraint is already set, and the value is the same as one we saw earlier,
               * show it as being 'from' this earlier ancestor rather than the child which repeated it.
               * The Graph will not allow children which specify a wider constraint than a parent,
               * e.g. a lower minLength or a higher maxLength, so we don't need to check for that.
               */
              (!narrowedConstraints[constraint] ||
                narrowedConstraints[constraint].value ===
                  parentSchema[constraint])
            ) {
              narrowedConstraints[constraint] = {
                value: parentSchema[constraint],
                from: parentSchema,
              };
            }
          }

          if (
            typeof parentSchema.format !== "undefined" &&
            (!narrowedConstraints.format ||
              narrowedConstraints.format.value === parentSchema.format)
          ) {
            narrowedConstraints.format = {
              value: parentSchema.format,
              from: parentSchema,
            };
          }

          if (typeof parentSchema.pattern !== "undefined") {
            narrowedConstraints.pattern ??= [];
            narrowedConstraints.pattern.push({
              value: parentSchema.pattern,
              from: parentSchema,
            });
          }
          break;
        }
        case "number": {
          if (
            typeof parentSchema.minimum !== "undefined" &&
            !narrowedConstraints.minimum
          ) {
            narrowedConstraints.minimum = {
              value: {
                value: parentSchema.minimum,
                exclusive: !!parentSchema.exclusiveMinimum,
              },
              from: parentSchema,
            };
          }

          if (
            typeof parentSchema.maximum !== "undefined" &&
            !narrowedConstraints.maximum
          ) {
            narrowedConstraints.maximum = {
              value: {
                value: parentSchema.maximum,
                exclusive: !!parentSchema.exclusiveMaximum,
              },
              from: parentSchema,
            };
          }

          if (
            typeof parentSchema.multipleOf !== "undefined" &&
            !narrowedConstraints.multipleOf?.find(
              (multipleOf) => multipleOf.value === parentSchema.multipleOf,
            )
          ) {
            narrowedConstraints.multipleOf ??= [];
            narrowedConstraints.multipleOf.push({
              value: parentSchema.multipleOf,
              from: parentSchema,
            });
          }

          break;
        }
        default:
          break;
      }

      parentsByVersionedUrl[parentVersionedUrl] = parent.schema;

      allOfStack.push(...(parent.schema.allOf?.map(({ $ref }) => $ref) ?? []));
    }

    return narrowedConstraints;
  }, [dataTypes, allOf]);

  const ownConstraints = useWatch({ control, name: "constraints" });

  const type = inheritedConstraints.type?.value ?? ownConstraints.type;

  switch (type) {
    case "string":
      return (
        <StringConstraints
          inheritedConstraints={inheritedConstraints}
          isReadOnly={isReadOnly}
        />
      );
    case "number":
      return (
        <NumberConstraints
          inheritedConstraints={inheritedConstraints}
          isReadOnly={isReadOnly}
        />
      );
    default:
      return null;
  }
};
