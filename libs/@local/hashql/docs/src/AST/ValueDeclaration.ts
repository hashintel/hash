import type * as ConstantDeclaration from "./ConstantDeclaration.js";
import type * as FunctionDeclaration from "./FunctionDeclaration.js";
import type * as $Interned from "./Interned.js";

export type ValueDeclaration =
  | ConstantDeclaration.ConstantDeclaration
  | FunctionDeclaration.FunctionDeclaration;

export type Interned = $Interned.Interned<ValueDeclaration>;
