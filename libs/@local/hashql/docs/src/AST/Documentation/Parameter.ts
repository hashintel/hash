import { Equal, Hash, Predicate, pipe } from "effect";

import * as DocSource from "../../internal/ast/doc-source.js";
import * as Traits from "../../internal/ast/traits.js";

import type { DocParamBlock, DocSection } from "@microsoft/tsdoc";
import type { Inspectable } from "effect";

const TypeId = "~hashql-docs/AST/Documentation/Parameter";

/** One `@param` block, which describes a parameter by the name it is declared with. */
export class Parameter implements Traits.Base {
  readonly [TypeId] = TypeId;
  readonly _tag = "Parameter" as const;

  readonly node: DocParamBlock;

  declare readonly pipe: Traits.Base["pipe"];
  declare readonly toString: Traits.Base["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Base[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(Parameter.prototype, Traits.Prototype);
  }

  constructor({ node }: Parameter.Fields) {
    this.node = node;
    Object.freeze(this);
  }

  get name(): string {
    return this.node.parameterName;
  }

  get content(): DocSection {
    return this.node.content;
  }

  [Hash.symbol](): number {
    return pipe(this._tag, Hash.string, Hash.combine(Hash.random(this.node)));
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isParameter(other) && this.node === other.node
    );
  }

  toJSON(): Traits.Base.Inspection {
    return {
      _tag: this._tag,
      node: DocSource.inspectNode(this.node),
      name: this.name,
    };
  }
}

export declare namespace Parameter {
  type Fields = Pick<Parameter, "node">;
}

/** Recognises this node kind by its own marker. */
export const isParameter = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is Parameter => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: Parameter.Fields): Parameter =>
  new Parameter(fields);
