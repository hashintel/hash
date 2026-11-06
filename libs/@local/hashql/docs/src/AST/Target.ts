import type * as Declaration from "./Declaration.js";
import type * as ExternalItem from "./ExternalItem.js";
import type * as $Interned from "./Interned.js";
import type * as Member from "./Member.js";
import type * as Parameter from "./Parameter.js";
import type * as TypeParameter from "./TypeParameter.js";

/** What a name in the package's syntax resolves to: a node the package declares, or an item outside it. */
export type Target = Local | ExternalItem.ExternalItem;

/** A node the package declares, which a name can refer to. */
export type Local =
  | Declaration.Declaration
  | Member.Member
  | TypeParameter.TypeParameter
  | Parameter.Parameter;

export type Interned = $Interned.Interned<Target>;

/** The symbol a name resolves to, which the store maps to the name's target. */
export type InternedSymbol = $Interned.InternedSymbol<Target>;
