import { typedEntries } from "../../util/typed-object-iter.js";
import type { CompileContext } from "../context/compile.js";
import type { CompiledTsType } from "../shared.js";

const replaceIntersectionWithExtends = (
  compiledTsType: CompiledTsType,
): CompiledTsType => {
  let fileWithReplacements = compiledTsType;

  /**
   * Replace multiple parent type aliases with interfaces.
   * The default code defines an alias of multiple types like so: type C = (A & B).
   *
   * We replace this with type C extends All<A, B> {}
   */
  const regexMultipleParents = /export\s+type\s+(\w+)\s*=\s*\(([\w\s&]+)\)/g;

  fileWithReplacements = fileWithReplacements.replace(
    regexMultipleParents,
    (match, p1: string, p2: string) => {
      const parents = p2.split(" & ");

      if (
        p1.endsWith("DataType") ||
        parents.some((parent) => parent.endsWith("DataType"))
      ) {
        return match;
      }

      return `export interface ${p1} extends All<[${parents.join(", ")}]> {}`;
    },
  );

  /**
   * Replace single type aliases with interfaces
   * The default generated code defines aliases as: type B = A
   */
  const regexSingleParent = /export\s+type\s+(\w+)\s*=\s*(\w+)/g;

  fileWithReplacements = fileWithReplacements.replace(
    regexSingleParent,
    (match, p1: string, p2: string) => {
      /**
       * Data type values are not interfaces
       */
      if (p1.endsWith("DataType") || p2.endsWith("DataType")) {
        return match;
      }
      return `export interface ${p1} extends ${p2} {}`;
    },
  );

  return fileWithReplacements;
};

/**
 * We use interfaces instead of types, so we want to replace A = B & C with A extends B, C {}
 */
export const replaceIntersectionsWithExtends = (
  context: CompileContext,
): void => {
  context.logDebug(
    "Replacing 'type C = A & B with `interface C extends A, B {}`",
  );

  for (const [typeId, compiledTsType] of typedEntries(
    context.typeIdsToCompiledTypes,
  )) {
    context.typeIdsToCompiledTypes[typeId] =
      replaceIntersectionWithExtends(compiledTsType);
  }
};
