import { Equal, Hash, Option, Predicate, pipe } from "effect";

import * as Source from "../internal/ast/source.js";
import * as Traits from "../internal/ast/traits.js";

import type * as $Interned from "./Interned.js";
import type * as Member from "./Member.js";
import type { Chunk, Inspectable } from "effect";
import type * as TypeScript from "typescript/ast";

const TypeId = "~hashql-docs/AST/ObjectType";

export class ObjectType implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "ObjectType" as const;

  readonly node: TypeScript.TypeLiteralNode;
  readonly members: Chunk.Chunk<Member.InternedType>;

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(ObjectType.prototype, Traits.Prototype);
  }

  constructor({ node, members }: ObjectType.Fields) {
    this.node = node;
    this.members = members;
    Object.freeze(this);
  }

  /** Syntax in type position carries no comment of its own. */
  readonly documentation: Traits.Traits["documentation"] = Option.none();

  [Hash.symbol](): number {
    return pipe(
      this._tag,
      Hash.string,
      Hash.combine(Hash.random(this.node)),
      Hash.combine(Hash.hash(this.members)),
    );
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isObjectType(other) &&
      this.node === other.node &&
      Equal.equals(this.members, other.members)
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      node: Source.inspectNode(this.node),
      members: this.members,
    };
  }
}

export declare namespace ObjectType {
  type Fields = Pick<ObjectType, "node" | "members">;
}

export type Interned = $Interned.Interned<ObjectType>;

/** Recognises this node kind by its own marker. */
export const isObjectType = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is ObjectType => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: ObjectType.Fields): ObjectType =>
  new ObjectType(fields);
