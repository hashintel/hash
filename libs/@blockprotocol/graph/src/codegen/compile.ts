import { compileSchemasToTypescript } from "./compile/compile-schemas-to-typescript.js";
import { removePlaceholderTypes } from "./compile/remove-placeholder-types.js";
import { replaceInterfaceWithType } from "./compile/replace-interface-with-type.js";
import type { CompileContext } from "./context/compile.js";

export const compile = async (context: CompileContext): Promise<void> => {
  await compileSchemasToTypescript(context);
  removePlaceholderTypes(context);
  replaceInterfaceWithType(context);
};
