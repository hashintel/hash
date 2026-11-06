// oxlint-disable import/max-dependencies -- AST node collection
import type * as Accessor from "./Accessor.js";
import type * as Alias from "./Alias.js";
import type * as Declaration from "./Declaration.js";
import type * as Documentation from "./Documentation/index.js";
import type * as ExternalItem from "./ExternalItem.js";
import type * as $Interned from "./Interned.js";
import type * as LeafDeclaration from "./LeafDeclaration.js";
import type * as Member from "./Member.js";
import type * as NamespaceDeclaration from "./NamespaceDeclaration.js";
import type * as Parameter from "./Parameter.js";
import type * as TypeNode from "./TypeNode.js";
import type * as TypeParameter from "./TypeParameter.js";

/** Source nodes retain modifiers and locations, and reach their comments through interned edges. Interned edges define traversal. */
export type Node =
  | Declaration.Declaration
  | Documentation.Documentation
  | LeafDeclaration.LeafDeclaration
  | LeafDeclaration.LeafDeclaration.Content
  | NamespaceDeclaration.NamespaceDeclaration
  | Alias.Alias
  | Member.Member
  | Accessor.Accessor.Part
  | Parameter.Parameter
  | TypeParameter.TypeParameter
  | ExternalItem.ExternalItem
  | TypeNode.TypeNode;

export declare namespace Node {
  type Visitor<A> = {
    readonly [Kind in Node["_tag"]]: (
      node: Extract<Node, { readonly _tag: Kind }>,
    ) => A;
  };
}

export type Interned = $Interned.Interned<Node>;
