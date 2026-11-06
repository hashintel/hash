import { Equal, Hash, Predicate, pipe } from "effect";

import * as Source from "../internal/ast/source.js";
import * as Traits from "../internal/ast/traits.js";

import type * as $Interned from "./Interned.js";
import type * as TypeNode from "./TypeNode.js";
import type { Inspectable, Option } from "effect";
import type * as TypeScript from "typescript/ast";

const TypeId = "~hashql-docs/AST/TypeParameter";

export class TypeParameter implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "TypeParameter" as const;

  readonly node: TypeScript.TypeParameterDeclaration;
  readonly name: string;
  readonly constraint: Option.Option<TypeNode.Interned>;
  readonly default: Option.Option<TypeNode.Interned>;
  readonly documentation: Traits.Traits["documentation"];

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(TypeParameter.prototype, Traits.Prototype);
  }

  constructor({
    node,
    name,
    constraint,
    default: defaultType,
    documentation,
  }: TypeParameter.Fields) {
    this.node = node;
    this.name = name;
    this.constraint = constraint;
    this.default = defaultType;
    this.documentation = documentation;
    Object.freeze(this);
  }

  [Hash.symbol](): number {
    return pipe(
      this._tag,
      Hash.string,
      Hash.combine(Hash.random(this.node)),
      Hash.combine(Hash.hash(this.name)),
      Hash.combine(Hash.hash(this.constraint)),
      Hash.combine(Hash.hash(this.default)),
      Hash.combine(Hash.hash(this.documentation)),
    );
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isTypeParameter(other) &&
      this.node === other.node &&
      this.name === other.name &&
      Equal.equals(this.constraint, other.constraint) &&
      Equal.equals(this.default, other.default) &&
      Equal.equals(this.documentation, other.documentation)
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      node: Source.inspectNode(this.node),
      name: this.name,
      constraint: this.constraint,
      default: this.default,
      documentation: this.documentation,
    };
  }
}

export declare namespace TypeParameter {
  type Fields = Pick<
    TypeParameter,
    "node" | "name" | "constraint" | "default" | "documentation"
  >;
}

export type Interned = $Interned.Interned<TypeParameter>;

/** Recognises this node kind by its own marker. */
export const isTypeParameter = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is TypeParameter => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: TypeParameter.Fields): TypeParameter =>
  new TypeParameter(fields);
