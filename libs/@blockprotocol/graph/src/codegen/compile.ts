import { compileSchemasToTypescript } from "./compile/compile-schemas-to-typescript.js";
import { makeInterfacesExtendBaseInterfaces } from "./compile/make-interfaces-extend-base-interfaces.js";
import { removePlaceholderTypes } from "./compile/remove-placeholder-types.js";
import { replaceIntersectionsWithExtends } from "./compile/replace-intersections-with-extends.js";
import type { CompileContext } from "./context/compile.js";

export const compile = async (context: CompileContext): Promise<void> => {
  await compileSchemasToTypescript(context);
  removePlaceholderTypes(context);
  replaceIntersectionsWithExtends(context);
  makeInterfacesExtendBaseInterfaces(context);
};
