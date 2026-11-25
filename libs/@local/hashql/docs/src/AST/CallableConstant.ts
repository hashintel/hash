import { Array, Equal, Hash, Predicate } from "effect";

import * as Source from "../internal/ast/source.js";
import * as Traits from "../internal/ast/traits.js";

import type * as CallSignature from "./CallSignature.js";
import type * as $Interned from "./Interned.js";
import type * as TypeNode from "./TypeNode.js";
import type { Chunk, Inspectable } from "effect";
import type * as TypeScript from "typescript/ast";

const TypeId = "~hashql-docs/AST/FunctionDeclaration/const";

const fields = ["node", "overloads", "type", "documentation"] as const;

/** A callable constant keeps the complete type alongside its ordered call signatures. */
export class CallableConstant implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "FunctionDeclaration" as const;
  readonly flavour = "const" as const;
  readonly node: TypeScript.VariableDeclaration;
  readonly overloads: Chunk.NonEmptyChunk<CallSignature.Interned>;
  /** The complete type retains properties and construct signatures alongside the calls. */
  readonly type: TypeNode.Interned;
  readonly documentation: Traits.Traits["documentation"];

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(CallableConstant.prototype, Traits.Prototype);
  }

  constructor({
    node,
    overloads,
    type,
    documentation,
  }: CallableConstant.Fields) {
    this.node = Equal.byReferenceUnsafe(node);
    this.overloads = overloads;
    this.type = type;
    this.documentation = documentation;
    Object.freeze(this);
  }

  [Hash.symbol](): number {
    return Hash.structureKeys(this, ["_tag", ...fields]);
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isCallableConstant(other) &&
      Array.every(fields, (field) => Equal.equals(this[field], other[field]))
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      flavour: this.flavour,
      node: Source.inspectNode(this.node),
      overloads: this.overloads,
      type: this.type,
      documentation: this.documentation,
    };
  }
}

export declare namespace CallableConstant {
  type Fields = Pick<CallableConstant, (typeof fields)[number]>;
}

export type Interned = $Interned.Interned<CallableConstant>;

/** Recognises this callable form by its own marker. */
export const isCallableConstant = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is CallableConstant => Predicate.hasProperty(value, TypeId);

/** Creates the callable node without expanding its interned signatures. */
export const make = (fields: CallableConstant.Fields): CallableConstant =>
  new CallableConstant(fields);
