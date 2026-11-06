import { Equal, Hash, Predicate, pipe } from "effect";

import * as Source from "../internal/ast/source.js";
import * as Traits from "../internal/ast/traits.js";

import type * as Alias from "./Alias.js";
import type * as Declaration from "./Declaration.js";
import type * as $Interned from "./Interned.js";
import type { Chunk, Inspectable } from "effect";
import type * as TypeScript from "typescript/ast";

const TypeId = "~hashql-docs/AST/NamespaceDeclaration";

/** A file or namespace keeps its declarations apart from the names it exports. */
export class NamespaceDeclaration implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "NamespaceDeclaration" as const;

  readonly node: TypeScript.SourceFile | TypeScript.ModuleDeclaration;
  readonly items: Chunk.Chunk<Declaration.Interned>;
  readonly exports: Chunk.Chunk<Alias.Interned>;
  readonly documentation: Traits.Traits["documentation"];

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(NamespaceDeclaration.prototype, Traits.Prototype);
  }

  constructor({
    node,
    items,
    exports,
    documentation,
  }: NamespaceDeclaration.Fields) {
    this.node = node;
    this.items = items;
    this.exports = exports;
    this.documentation = documentation;
    Object.freeze(this);
  }

  [Hash.symbol](): number {
    return pipe(
      this._tag,
      Hash.string,
      Hash.combine(Hash.random(this.node)),
      Hash.combine(Hash.hash(this.items)),
      Hash.combine(Hash.hash(this.exports)),
      Hash.combine(Hash.hash(this.documentation)),
    );
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isNamespaceDeclaration(other) &&
      this.node === other.node &&
      Equal.equals(this.items, other.items) &&
      Equal.equals(this.exports, other.exports) &&
      Equal.equals(this.documentation, other.documentation)
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      node: Source.inspectNode(this.node),
      items: this.items,
      exports: this.exports,
      documentation: this.documentation,
    };
  }
}

export declare namespace NamespaceDeclaration {
  type Fields = Pick<
    NamespaceDeclaration,
    "node" | "items" | "exports" | "documentation"
  >;
}

export type Interned = $Interned.Interned<NamespaceDeclaration>;

/** Recognises this node kind by its own marker. */
export const isNamespaceDeclaration = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is NamespaceDeclaration => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (
  fields: NamespaceDeclaration.Fields,
): NamespaceDeclaration => new NamespaceDeclaration(fields);
