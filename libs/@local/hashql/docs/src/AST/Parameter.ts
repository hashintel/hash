import { Equal, Hash, Predicate, pipe } from "effect";

import * as Source from "../internal/ast/source.js";
import * as Traits from "../internal/ast/traits.js";

import type * as $Interned from "./Interned.js";
import type * as TypeNode from "./TypeNode.js";
import type { Inspectable, Option } from "effect";
import type * as TypeScript from "typescript/ast";

const TypeId = "~hashql-docs/AST/Parameter";

export class Parameter implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "Parameter" as const;

  readonly node: TypeScript.ParameterDeclaration;
  readonly name: string;
  readonly optional: boolean;
  readonly rest: boolean;
  readonly type: Option.Option<TypeNode.Interned>;
  readonly documentation: Traits.Traits["documentation"];

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(Parameter.prototype, Traits.Prototype);
  }

  constructor({
    node,
    name,
    optional,
    rest,
    type,
    documentation,
  }: Parameter.Fields) {
    this.node = node;
    this.name = name;
    this.optional = optional;
    this.rest = rest;
    this.type = type;
    this.documentation = documentation;
    Object.freeze(this);
  }

  [Hash.symbol](): number {
    return pipe(
      this._tag,
      Hash.string,
      Hash.combine(Hash.random(this.node)),
      Hash.combine(Hash.hash(this.name)),
      Hash.combine(Hash.hash(this.optional)),
      Hash.combine(Hash.hash(this.rest)),
      Hash.combine(Hash.hash(this.type)),
      Hash.combine(Hash.hash(this.documentation)),
    );
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isParameter(other) &&
      this.node === other.node &&
      this.name === other.name &&
      this.optional === other.optional &&
      this.rest === other.rest &&
      Equal.equals(this.type, other.type) &&
      Equal.equals(this.documentation, other.documentation)
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      node: Source.inspectNode(this.node),
      name: this.name,
      optional: this.optional,
      rest: this.rest,
      type: this.type,
      documentation: this.documentation,
    };
  }
}

export declare namespace Parameter {
  type Fields = Pick<
    Parameter,
    "node" | "name" | "optional" | "rest" | "type" | "documentation"
  >;
}

export type Interned = $Interned.Interned<Parameter>;

/** Recognises this node kind by its own marker. */
export const isParameter = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is Parameter => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: Parameter.Fields): Parameter =>
  new Parameter(fields);
