import { compileSchemasToTypescript } from "./compile/compile-schemas-to-typescript.js";
import { removePlaceholderTypes } from "./compile/remove-placeholder-types.js";
import type { CompileContext } from "./context/compile.js";
import { replaceIntersectionsWithExtends } from "./compile/replace-intersections-with-extends.js";

export const compile = async (context: CompileContext): Promise<void> => {
  await compileSchemasToTypescript(context);
  removePlaceholderTypes(context);
  replaceIntersectionsWithExtends(context);
};
