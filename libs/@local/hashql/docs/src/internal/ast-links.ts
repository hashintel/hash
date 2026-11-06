import { DocLinkTag } from "@microsoft/tsdoc";
import { Array, Effect, HashMap, Option, pipe } from "effect";
import * as Syntax from "typescript/ast";

import * as AST from "../AST/index.js";
import * as DocumentationError from "../DocumentationError.js";
import * as TypeScript from "../TypeScript/index.js";
import * as References from "./ast-references.js";
import * as DocSource from "./ast/doc-source.js";
import * as LinkLookup from "./link-lookup.js";

import type { DocNode } from "@microsoft/tsdoc";
import type { Cause } from "effect";
import type { Symbol as CompilerSymbol } from "typescript/async";

/** The opening brace's source position, where the compiler's node for the same link starts too, since TSDoc read the comment in place. */
const startOf = (link: DocLinkTag): Option.Option<number> =>
  Option.map(DocSource.rangeOf(link), ({ pos }) => pos);

/** The links below `node`. A link holds no other link. */
const linksIn = (node: DocNode): readonly DocLinkTag[] => {
  if (node instanceof DocLinkTag) {
    return [node];
  }

  return Array.flatMap(node.getChildNodes(), linksIn);
};

/** Everything a reader sees. Private remarks are left out, so their links never have to resolve. */
const publicProse = ({
  source,
}: AST.Documentation.Documentation): readonly DocNode[] =>
  Array.filter(
    source.getChildNodes(),
    (node) => node !== source.privateRemarks,
  );

/** The compiler's links in `comment`, its tags' text included. */
const compilerLinks = (
  comment: Syntax.JSDoc,
): readonly (
  | Syntax.JSDocLink
  | Syntax.JSDocLinkCode
  | Syntax.JSDocLinkPlain
)[] =>
  pipe(
    comment.comment,
    Array.appendAll(
      Array.flatMap(comment.tags ?? [], (tag) => tag.comment ?? []),
    ),
    Array.filter(
      (node) =>
        Syntax.isJSDocLink(node) ||
        Syntax.isJSDocLinkCode(node) ||
        Syntax.isJSDocLinkPlain(node),
    ),
  );

/**
 * Records each link to a declaration in the public prose of `documentation`, which `owner`'s comment holds.
 *
 * A link the compiler may bind resolves with the declarations' names. A link that names part of a declaration fails, because the reference documents whole declarations.
 */
export const register = Effect.fnUntraced(function* (
  documentation: AST.Documentation.Documentation,
  owner: Syntax.Node,
): Effect.fn.Return<
  void,
  DocumentationError.DocumentationError,
  References.References
> {
  const file = documentation.node.getSourceFile().fileName;
  const compiled = compilerLinks(documentation.node);

  for (const tag of Array.flatMap(publicProse(documentation), linksIn)) {
    const destination = tag.codeDestination;
    const start = startOf(tag);

    if (destination !== undefined && Option.isSome(start)) {
      if (
        Array.some(
          destination.memberReferences,
          (member) =>
            member.selector !== undefined || member.memberSymbol !== undefined,
        )
      ) {
        return yield* DocumentationError.DocumentationError.make({
          file,
          reason: {
            _tag: "UnsupportedReference",
            destination: destination.emitAsTsdoc(),
            start: start.value,
          },
        });
      }

      const node = Array.findFirst(
        compiled,
        (link) => link.pos === start.value,
      );
      // A package-qualified destination names a public path, not a binding in the comment's file.
      const name = pipe(
        node,
        Option.flatMap((link) => Option.fromUndefinedOr(link.name)),
        Option.filter(() => destination.packageName === undefined),
      );

      yield* References.link({
        tag,
        node: Option.getOrElse(
          Option.orElse(name, () => node),
          (): Syntax.Node => documentation.node,
        ),
        named: Option.isSome(name),
        owner,
      });
    }
  }
});

/** Where a comment's names resolve, and whether a reader sees the comment. */
interface Scope {
  /** The public name of the innermost public declaration around the comment, below which its names resolve. */
  readonly owner: LinkLookup.Scope["owner"];
  /** Whether the declaration the comment documents is public. A member's comment documents the member's owner. */
  readonly public: boolean;
}

/** The public declarations around `node`, innermost first. */
const scopeOf = Effect.fnUntraced(function* (
  node: Syntax.Node,
  catalogue: LinkLookup.Scope["catalogue"],
): Effect.fn.Return<Scope, Cause.UnknownError, TypeScript.Checker.Checker> {
  const checker = yield* TypeScript.Checker.Checker;
  const { ast } = catalogue;
  let documented = true;
  let current: Syntax.Node | undefined = node;

  while (current !== undefined) {
    let symbol = Option.none<CompilerSymbol>();

    if (Syntax.isSourceFile(current)) {
      symbol = yield* checker.getSymbolOfSourceFile(current.fileName);
    } else if (References.isDefinition(current)) {
      symbol = Option.some(yield* checker.getSymbolOfDeclaration(current));
    }

    const entry = pipe(
      symbol,
      Option.flatMap(ast.localOf),
      Option.flatMap((local) =>
        ast.narrow(local, AST.Declaration.isDeclaration),
      ),
      Option.flatMap((id) => HashMap.get(catalogue.byId, id)),
    );

    if (Option.isSome(entry)) {
      return { owner: Option.some(entry.value.name), public: documented };
    }

    // The first declaration around the comment is the one it documents.
    if (Option.isSome(symbol)) {
      documented = false;
    }

    current = Syntax.isSourceFile(current) ? undefined : current.parent;
  }

  return { owner: Option.none(), public: false };
});

/** The failure for a link in a public comment that leads a reader nowhere. */
const unresolved = (
  tag: DocLinkTag,
  node: Syntax.Node,
  destination: string,
): Effect.Effect<never, DocumentationError.DocumentationError> =>
  DocumentationError.DocumentationError.make({
    file: node.getSourceFile().fileName,
    reason: {
      _tag: "UnresolvedLink",
      destination,
      start: Option.getOrElse(startOf(tag), () => node.pos),
    },
  });

/** Whether a link's binding gives a reader somewhere to go. A name outside the package that no page documents does not. */
const leadsNowhere = ({ target, url }: AST.Reference.Reference): boolean =>
  target._tag === "External" && Option.isNone(url);

/**
 * Resolves each link the compiler did not bind, or bound to a name outside the package that no page documents, through the public names of `catalogue`.
 *
 * A package-qualified name starts at its entrypoint. The lookup reads any other name below the public declaration around its comment, then in each enclosing namespace outwards. The compiler can bind a qualified name to something its author did not mean, such as a class's static where the comment names an instance member. A binding a reader cannot follow therefore gives way to the public name. A link in a public declaration's comment that still leads nowhere fails, because a reader would lose its destination. A private declaration's comment keeps such a link as it is, so it fails only where a page shows it.
 */
export const resolve = Effect.fnUntraced(function* (
  catalogue: LinkLookup.Scope["catalogue"],
): Effect.fn.Return<
  void,
  DocumentationError.DocumentationError | Cause.UnknownError,
  References.References | TypeScript.Checker.Checker
> {
  const { ast } = catalogue;

  for (const { tag, node, owner } of yield* References.links) {
    const destination = tag.codeDestination;

    if (
      destination !== undefined &&
      !Option.exists(ast.referenceAt(tag), (bound) => !leadsNowhere(bound))
    ) {
      const scope = yield* scopeOf(owner, catalogue);
      const target = LinkLookup.reference({ catalogue, owner: scope.owner })(
        destination,
      );

      if (Option.isNone(target) && scope.public) {
        return yield* unresolved(tag, node, destination.emitAsTsdoc());
      }

      if (Option.isSome(target)) {
        const reference = AST.Reference.make({
          node,
          target: target.value,
          url: Option.none(),
          quickInfo: Option.none(),
        });
        ast.reference(tag, ast.intern(reference));
      }
    }
  }
});
