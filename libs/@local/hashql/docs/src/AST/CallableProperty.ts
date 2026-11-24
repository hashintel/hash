import { Array, Equal, Hash, Predicate } from "effect";

import * as Source from "../internal/ast/source.js";
import * as Traits from "../internal/ast/traits.js";

import type * as CallSignature from "./CallSignature.js";
import type * as $Interned from "./Interned.js";
import type * as TypeNode from "./TypeNode.js";
import type { Chunk, Inspectable } from "effect";
import type * as TypeScript from "typescript/ast";

const TypeId = "~hashql-docs/AST/Method/property";

const fields = [
  "node",
  "overloads",
  "name",
  "static",
  "type",
  "documentation",
] as const;

/** A callable property keeps its declaration and its complete type alongside the ordered call signatures of that type. */
export class CallableProperty implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "Method" as const;
  readonly flavour = "property" as const;
  readonly node:
    | TypeScript.PropertyDeclaration
    | TypeScript.PropertySignatureDeclaration;
  readonly overloads: Chunk.NonEmptyChunk<CallSignature.Interned>;
  /** The member's name as its declaration spells it, without the quotes of a string-literal name. */
  readonly name: string;
  /** Whether the member belongs to its class rather than to its instances. */
  readonly static: boolean;
  /** The complete type retains properties and construct signatures alongside the calls. */
  readonly type: TypeNode.Interned;
  readonly documentation: Traits.Traits["documentation"];

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(CallableProperty.prototype, Traits.Prototype);
  }

  constructor({
    node,
    overloads,
    name,
    static: isStatic,
    type,
    documentation,
  }: CallableProperty.Fields) {
    this.node = Equal.byReferenceUnsafe(node);
    this.overloads = overloads;
    this.name = name;
    this.static = isStatic;
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
      isCallableProperty(other) &&
      Array.every(fields, (field) => Equal.equals(this[field], other[field]))
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      flavour: this.flavour,
      node: Source.inspectNode(this.node),
      overloads: this.overloads,
      name: this.name,
      static: this.static,
      type: this.type,
      documentation: this.documentation,
    };
  }
}

export declare namespace CallableProperty {
  type Fields = Pick<CallableProperty, (typeof fields)[number]>;
}

export type Interned = $Interned.Interned<CallableProperty>;

/** Recognises this callable form by its own marker. */
export const isCallableProperty = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is CallableProperty => Predicate.hasProperty(value, TypeId);

/** Creates the callable node without expanding its interned signatures. */
export const make = (fields: CallableProperty.Fields): CallableProperty =>
  new CallableProperty(fields);
