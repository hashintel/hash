import type * as InterfaceDeclaration from "./InterfaceDeclaration.js";
import type * as $Interned from "./Interned.js";
import type * as TypeAliasDeclaration from "./TypeAliasDeclaration.js";

export type TypeDeclaration =
  | InterfaceDeclaration.InterfaceDeclaration
  | TypeAliasDeclaration.TypeAliasDeclaration;

export type Interned = $Interned.Interned<TypeDeclaration>;
