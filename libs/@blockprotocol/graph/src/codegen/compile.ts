import { compileSchemasToTypescript } from "./compile/compile-schemas-to-typescript";
import { removePlaceholderTypes } from "./compile/remove-placeholder-types";
import { replaceInterfaceWithType } from "./compile/replace-interface-with-type";
import type { CompileContext } from "./context/compile";

export const compile = async (context: CompileContext): Promise<void> => {
  await compileSchemasToTypescript(context);
  removePlaceholderTypes(context);
  replaceInterfaceWithType(context);
};
