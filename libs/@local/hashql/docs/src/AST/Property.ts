import { Equal, Hash, Predicate, pipe } from "effect";

import * as Source from "../internal/ast/source.js";
import * as Traits from "../internal/ast/traits.js";

import type * as $Interned from "./Interned.js";
import type * as TypeNode from "./TypeNode.js";
import type { Inspectable, Option } from "effect";
import type * as TypeScript from "typescript/ast";

const TypeId = "~hashql-docs/AST/Property";

export class Property implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "Property" as const;

  readonly node:
    | TypeScript.PropertyDeclaration
    | TypeScript.PropertySignatureDeclaration;
  /** The member's name as its declaration spells it, without the quotes of a string-literal name. */
  readonly name: string;
  /** Whether the member belongs to its class rather than to its instances. */
  readonly static: boolean;
  readonly type: Option.Option<TypeNode.Interned>;
  readonly documentation: Traits.Traits["documentation"];

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(Property.prototype, Traits.Prototype);
  }

  constructor({
    node,
    name,
    static: isStatic,
    type,
    documentation,
  }: Property.Fields) {
    this.node = node;
    this.name = name;
    this.static = isStatic;
    this.type = type;
    this.documentation = documentation;
    Object.freeze(this);
  }

  [Hash.symbol](): number {
    return pipe(
      this._tag,
      Hash.string,
      Hash.combine(Hash.random(this.node)),
      Hash.combine(Hash.string(this.name)),
      Hash.combine(Hash.hash(this.static)),
      Hash.combine(Hash.hash(this.type)),
      Hash.combine(Hash.hash(this.documentation)),
    );
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isProperty(other) &&
      this.node === other.node &&
      this.name === other.name &&
      this.static === other.static &&
      Equal.equals(this.type, other.type) &&
      Equal.equals(this.documentation, other.documentation)
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      node: Source.inspectNode(this.node),
      name: this.name,
      static: this.static,
      type: this.type,
      documentation: this.documentation,
    };
  }
}

export declare namespace Property {
  type Fields = Pick<
    Property,
    "node" | "name" | "static" | "type" | "documentation"
  >;
}

export type Interned = $Interned.Interned<Property>;

/** Recognises this node kind by its own marker. */
export const isProperty = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is Property => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: Property.Fields): Property => new Property(fields);
