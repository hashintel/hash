import { Equal, Hash, Option, Predicate, pipe } from "effect";

import * as Traits from "../internal/ast/traits.js";

import type * as ClassDeclaration from "./ClassDeclaration.js";
import type * as EnumDeclaration from "./EnumDeclaration.js";
import type * as $Interned from "./Interned.js";
import type { Inspectable } from "effect";

const TypeId = "~hashql-docs/AST/JointDeclaration";

/** One class or enum declaration introduces both the type and the value meaning. */
export class JointDeclaration implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "JointDeclaration" as const;

  readonly declaration: $Interned.Interned<JointDeclaration.Declaration>;

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(JointDeclaration.prototype, Traits.Prototype);
  }

  constructor({ declaration }: JointDeclaration.Fields) {
    this.declaration = declaration;
    Object.freeze(this);
  }

  readonly documentation: Traits.Traits["documentation"] = Option.none();

  [Hash.symbol](): number {
    return pipe(
      this._tag,
      Hash.string,
      Hash.combine(Hash.hash(this.declaration)),
    );
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
    return isJointDeclaration(other) && this.declaration === other.declaration;
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      declaration: this.declaration,
    };
  }
}

export declare namespace JointDeclaration {
  type Fields = Pick<JointDeclaration, "declaration">;
  type Declaration =
    | ClassDeclaration.ClassDeclaration
    | EnumDeclaration.EnumDeclaration;
}

export type Interned = $Interned.Interned<JointDeclaration>;

/** Recognises this node kind by its own marker. */
export const isJointDeclaration = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is JointDeclaration => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: JointDeclaration.Fields): JointDeclaration =>
  new JointDeclaration(fields);
