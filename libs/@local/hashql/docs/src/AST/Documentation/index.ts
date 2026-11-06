// oxlint-disable import/max-dependencies -- The root node owns a field for every kind of block a comment can hold.
import { Array, Equal, Hash, Predicate } from "effect";

import * as DocSource from "../../internal/ast/doc-source.js";
import * as Source from "../../internal/ast/source.js";
import * as Traits from "../../internal/ast/traits.js";

import type * as $Interned from "../Interned.js";
import type * as Category from "./Category.js";
import type * as CustomBlock from "./CustomBlock.js";
import type * as Deprecated from "./Deprecated.js";
import type * as Example from "./Example.js";
import type * as InheritDoc from "./InheritDoc.js";
import type * as Modifier from "./Modifier.js";
import type * as Parameter from "./Parameter.js";
import type * as Remarks from "./Remarks.js";
import type * as Returns from "./Returns.js";
import type * as See from "./See.js";
import type * as Since from "./Since.js";
import type * as Stability from "./Stability.js";
import type * as Throws from "./Throws.js";
import type * as TypeParameter from "./TypeParameter.js";
import type { DocComment, DocSection } from "@microsoft/tsdoc";
import type { Inspectable, Option } from "effect";
import type { JSDoc } from "typescript/ast";

export * as Caption from "./Caption.js";
export * as Category from "./Category.js";
export * as CustomBlock from "./CustomBlock.js";
export * as Deprecated from "./Deprecated.js";

export * as Example from "./Example.js";
export * as InheritDoc from "./InheritDoc.js";
export * as Modifier from "./Modifier.js";
export * as Parameter from "./Parameter.js";
export * as Remarks from "./Remarks.js";
export * as Returns from "./Returns.js";
export * as See from "./See.js";
export * as Since from "./Since.js";
export * as Stability from "./Stability.js";
export * as Throws from "./Throws.js";
export * as TypeParameter from "./TypeParameter.js";

const TypeId = "~hashql-docs/AST/Documentation";

const fields = [
  "node",
  "source",
  "remarks",
  "parameters",
  "typeParameters",
  "returns",
  "throws",
  "see",
  "examples",
  "since",
  "category",
  "stability",
  "deprecated",
  "inheritDoc",
  "internal",
  "trait",
  "module",
  "modifiers",
  "customBlocks",
] as const;

/**
 * One parsed comment, before name resolution or rendering.
 *
 * Its compiler and TSDoc objects compare by identity, so two nodes are equal only when they come from one parse of one comment. Every block keeps the TSDoc node it came from, so its prose tree, including code spans and unresolved links, and its source positions stay available. Private remarks stay only in `source`, so a public-content traversal can omit them without discarding the parsed comment.
 */
export class Documentation implements Traits.Base {
  readonly [TypeId] = TypeId;
  readonly _tag = "Documentation" as const;

  readonly node: JSDoc;
  /** TSDoc's parse of `node`, whose positions are offsets into `node`'s source file. */
  readonly source: DocComment;
  readonly remarks: Option.Option<Remarks.Remarks>;
  readonly parameters: readonly Parameter.Parameter[];
  readonly typeParameters: readonly TypeParameter.TypeParameter[];
  readonly returns: Option.Option<Returns.Returns>;
  readonly throws: readonly Throws.Throws[];
  readonly see: readonly See.See[];
  readonly examples: readonly Example.Example[];
  readonly since: Option.Option<Since.Since>;
  readonly category: Option.Option<Category.Category>;
  readonly stability: Option.Option<Stability.Stability>;
  readonly deprecated: Option.Option<Deprecated.Deprecated>;
  readonly inheritDoc: Option.Option<InheritDoc.InheritDoc>;
  /** The `@internal` modifier, which is also among `modifiers`. */
  readonly internal: Option.Option<Modifier.Modifier>;
  /** The `@trait` modifier, which is also among `modifiers`. */
  readonly trait: Option.Option<Modifier.Modifier>;
  /** The `@module` modifier, which is also among `modifiers`. */
  readonly module: Option.Option<Modifier.Modifier>;
  /** Every modifier, in source order. */
  readonly modifiers: readonly Modifier.Modifier[];
  /** Configured blocks without a dedicated field, in source order. */
  readonly customBlocks: readonly CustomBlock.CustomBlock[];

  declare readonly pipe: Traits.Base["pipe"];
  declare readonly toString: Traits.Base["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Base[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(Documentation.prototype, Traits.Prototype);
  }

  constructor({
    node,
    source,
    remarks,
    parameters,
    typeParameters,
    returns,
    throws,
    see,
    examples,
    since,
    category,
    stability,
    deprecated,
    inheritDoc,
    internal,
    trait,
    module,
    modifiers,
    customBlocks,
  }: Documentation.Fields) {
    this.node = Equal.byReferenceUnsafe(node);
    this.source = Equal.byReferenceUnsafe(source);
    this.remarks = remarks;
    this.parameters = parameters;
    this.typeParameters = typeParameters;
    this.returns = returns;
    this.throws = throws;
    this.see = see;
    this.examples = examples;
    this.since = since;
    this.category = category;
    this.stability = stability;
    this.deprecated = deprecated;
    this.inheritDoc = inheritDoc;
    this.internal = internal;
    this.trait = trait;
    this.module = module;
    this.modifiers = modifiers;
    this.customBlocks = customBlocks;
    Object.freeze(this);
  }

  /** The summary section, everything before the comment's first block. */
  get description(): DocSection {
    return this.source.summarySection;
  }

  [Hash.symbol](): number {
    return Hash.structureKeys(this, ["_tag", ...fields]);
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isDocumentation(other) &&
      Array.every(fields, (field) => Equal.equals(this[field], other[field]))
    );
  }

  toJSON(): Traits.Base.Inspection {
    return {
      _tag: this._tag,
      node: Source.inspectNode(this.node),
      source: DocSource.inspectNode(this.source),
      remarks: this.remarks,
      parameters: this.parameters,
      typeParameters: this.typeParameters,
      returns: this.returns,
      throws: this.throws,
      see: this.see,
      examples: this.examples,
      since: this.since,
      category: this.category,
      stability: this.stability,
      deprecated: this.deprecated,
      inheritDoc: this.inheritDoc,
      internal: this.internal,
      trait: this.trait,
      module: this.module,
      modifiers: this.modifiers,
      customBlocks: this.customBlocks,
    };
  }
}

export declare namespace Documentation {
  type Fields = Pick<Documentation, (typeof fields)[number]>;
}

export type Interned = $Interned.Interned<Documentation>;

/** Recognises this node kind by its own marker. */
export const isDocumentation = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is Documentation => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: Documentation.Fields): Documentation =>
  new Documentation(fields);
