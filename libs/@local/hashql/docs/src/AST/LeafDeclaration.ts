import type * as IndependentDeclarations from "./IndependentDeclarations.js";
import type * as $Interned from "./Interned.js";
import type * as JointDeclaration from "./JointDeclaration.js";
import type * as TypeDeclaration from "./TypeDeclaration.js";
import type * as ValueDeclaration from "./ValueDeclaration.js";

export type LeafDeclaration =
  | IndependentDeclarations.IndependentDeclarations
  | JointDeclaration.JointDeclaration;

export declare namespace LeafDeclaration {
  type Content =
    | TypeDeclaration.TypeDeclaration
    | ValueDeclaration.ValueDeclaration
    | JointDeclaration.JointDeclaration.Declaration;
}

export type Interned = $Interned.Interned<LeafDeclaration>;
