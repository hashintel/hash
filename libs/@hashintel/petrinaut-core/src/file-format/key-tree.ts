import type { z } from "zod";

/**
 * Where a key sits in a document: the object keys and array positions that
 * lead to it from the root, such as
 * `["subnets", 0, "places", 1, "portDirection"]`.
 */
export type DocumentKeyPath = ReadonlyArray<string | number>;

/**
 * The keys a document format defines. A key maps to the tree of the keys
 * beneath it, or to `true` where nothing beneath it is checked. An array has
 * the tree of its elements.
 */
export type KeyTree = { readonly [key: string]: KeyTree | true };

const keepsOtherKeys = ({ catchall }: z.core.$ZodObjectDef): boolean =>
  catchall !== undefined && catchall._zod.def.type !== "never";

/**
 * The keys `schema` defines on the objects it reaches through objects, arrays
 * and wrappers such as `.optional()` and `.default()`. Any other schema is
 * `true`, a union and a record included, and so is an object that keeps the
 * keys it does not define.
 */
export const keyTreeOf = (schema: z.core.$ZodType): KeyTree | true => {
  const { def } = (schema as z.core.$ZodTypes)._zod;
  switch (def.type) {
    case "object":
      return keepsOtherKeys(def)
        ? true
        : Object.fromEntries(
            Object.entries(def.shape).map(([key, property]) => [
              key,
              keyTreeOf(property),
            ]),
          );
    case "array":
      return keyTreeOf(def.element);
    case "optional":
    case "nullable":
    case "default":
    case "prefault":
    case "nonoptional":
    case "readonly":
    case "catch":
      return keyTreeOf(def.innerType);
    default:
      return true;
  }
};

const holdsNothing = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === "object" && Object.keys(value).length === 0);

/**
 * The path of every key in `document` that `keys` does not define. A key that
 * holds nothing (`undefined`, `null`, `[]` or `{}`) is left out: a reader
 * that drops it loses nothing.
 */
export const findUnknownKeys = (
  keys: KeyTree | true,
  document: unknown,
): DocumentKeyPath[] => {
  const unknownKeys: DocumentKeyPath[] = [];

  const visit = (
    tree: KeyTree | true,
    value: unknown,
    path: DocumentKeyPath,
  ): void => {
    if (tree === true || typeof value !== "object" || value === null) {
      return;
    }
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        visit(tree, item, [...path, index]);
      }
      return;
    }
    for (const [key, held] of Object.entries(value)) {
      // An own-property check: `tree.constructor` is inherited, not defined.
      const beneath = Object.hasOwn(tree, key) ? tree[key] : undefined;
      if (beneath !== undefined) {
        visit(beneath, held, [...path, key]);
      } else if (!holdsNothing(held)) {
        unknownKeys.push([...path, key]);
      }
    }
  };

  visit(keys, document, []);
  return unknownKeys;
};
