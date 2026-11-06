import { Equal, Hash, Option, Predicate, pipe } from "effect";

import * as DocSource from "../../internal/ast/doc-source.js";
import * as Traits from "../../internal/ast/traits.js";

import type {
  DocDeclarationReference,
  DocInheritDocTag,
} from "@microsoft/tsdoc";
import type { Inspectable } from "effect";

const TypeId = "~hashql-docs/AST/Documentation/InheritDoc";

/** The `{@inheritDoc}` tag, which asks for another declaration's documentation in place of this comment's. */
export class InheritDoc implements Traits.Base {
  readonly [TypeId] = TypeId;
  readonly _tag = "InheritDoc" as const;

  readonly node: DocInheritDocTag;

  declare readonly pipe: Traits.Base["pipe"];
  declare readonly toString: Traits.Base["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Base[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(InheritDoc.prototype, Traits.Prototype);
  }

  constructor({ node }: InheritDoc.Fields) {
    this.node = node;
    Object.freeze(this);
  }

  /** The declaration to inherit from, unresolved. The tag may omit it. */
  get reference(): Option.Option<DocDeclarationReference> {
    return Option.fromUndefinedOr(this.node.declarationReference);
  }

  [Hash.symbol](): number {
    return pipe(this._tag, Hash.string, Hash.combine(Hash.random(this.node)));
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isInheritDoc(other) && this.node === other.node
    );
  }

  toJSON(): Traits.Base.Inspection {
    return {
      _tag: this._tag,
      node: DocSource.inspectNode(this.node),
      reference: Option.map(this.reference, (reference) =>
        reference.emitAsTsdoc(),
      ),
    };
  }
}

export declare namespace InheritDoc {
  type Fields = Pick<InheritDoc, "node">;
}

/** Recognises this node kind by its own marker. */
export const isInheritDoc = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is InheritDoc => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: InheritDoc.Fields): InheritDoc =>
  new InheritDoc(fields);
