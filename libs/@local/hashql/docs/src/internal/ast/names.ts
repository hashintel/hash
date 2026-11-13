import { Option } from "effect";

import type * as AST from "../../AST/index.js";
import type * as QuickInfo from "../../QuickInfo.js";
import type { DocLinkTag } from "@microsoft/tsdoc";
import type { Node, SourceFile } from "typescript/ast";

/** What a name the AST's own nodes do not hold resolves to: a `{@link}` in a comment, or an identifier in an example's code. */
export interface Name {
  readonly target: AST.Target.InternedSymbol;
  /** What an editor shows on hover over the name, for a name in an example's code. */
  readonly quickInfo: Option.Option<QuickInfo.QuickInfo>;
}

/** What the AST records beside its nodes: what the links in its comments and the names in its examples resolve to. */
export interface Names {
  /** Records what a `{@link}` in a comment or a name in an example's code resolves to. */
  readonly name: (node: Node | DocLinkTag, name: Name) => void;
  /** What a `{@link}` in a comment or a name in an example's code resolves to, or none for one that resolves to nothing. */
  readonly nameOf: (node: Node | DocLinkTag) => Option.Option<Name>;

  /** Records what an editor shows on hover over a name in an example's code that resolves to nothing. */
  readonly hover: (name: Node, quickInfo: QuickInfo.QuickInfo) => void;
  /** What an editor shows on hover over a name in an example's code that resolves to nothing, or none for a name it shows nothing for. */
  readonly hoverOf: (name: Node) => Option.Option<QuickInfo.QuickInfo>;

  /** Records the source file an example's code was compiled as. */
  readonly program: (
    example: AST.Documentation.Example.Example,
    file: SourceFile,
  ) => void;
  /** The source file an example's code was compiled as, or none for an example whose language the compiler does not read. */
  readonly programOf: (
    example: AST.Documentation.Example.Example,
  ) => Option.Option<SourceFile>;
}

/** Empty tables, which hold a node only while the program that made it does. */
export const make = (): Names => {
  const names = new WeakMap<Node | DocLinkTag, Name>();
  const hovers = new WeakMap<Node, QuickInfo.QuickInfo>();
  const programs = new WeakMap<AST.Documentation.Example.Example, SourceFile>();

  return {
    name: (node, name) => {
      names.set(node, name);
    },
    nameOf: (node) => Option.fromUndefinedOr(names.get(node)),
    hover: (name, quickInfo) => {
      hovers.set(name, quickInfo);
    },
    hoverOf: (name) => Option.fromUndefinedOr(hovers.get(name)),
    program: (example, file) => {
      programs.set(example, file);
    },
    programOf: (example) => Option.fromUndefinedOr(programs.get(example)),
  };
};
