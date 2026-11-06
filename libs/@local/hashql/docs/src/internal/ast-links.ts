import { Array, Effect, HashMap, Option, pipe } from "effect";
import * as Syntax from "typescript/ast";

import * as AST from "../AST/index.js";
import * as DocumentationError from "../DocumentationError.js";
import * as Names from "./ast-names.js";
import * as DocSource from "./ast/doc-source.js";
import * as LinkLookup from "./link-lookup.js";

import type * as TypeScript from "../TypeScript/index.js";
import type { DocLinkTag } from "@microsoft/tsdoc";
import type { Cause } from "effect";

/** The opening brace's source position, where the compiler's node for the same link starts too, since TSDoc read the comment in place. */
const startOf = (link: DocLinkTag): Option.Option<number> =>
  Option.map(DocSource.rangeOf(link), ({ pos }) => pos);

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
 * Resolves each link to a declaration in the public prose of `documentation` that the compiler binds, where the comment stands.
 *
 * A link the compiler does not bind waits for `resolve`, which reads the public names once the parse holds every declaration. Naming part of a declaration fails, because the reference documents whole declarations.
 */
export const register = Effect.fnUntraced(function* (
  documentation: AST.Documentation.Documentation,
): Effect.fn.Return<
  void,
  DocumentationError.DocumentationError | Cause.UnknownError,
  AST.Store | TypeScript.Checker.Checker
> {
  const store = yield* AST.Store;
  const file = documentation.node.getSourceFile().fileName;
  const compiled = compilerLinks(documentation.node);

  for (const tag of DocSource.linksOf(documentation)) {
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

      // A package-qualified destination names a public path, not a binding in the comment's file.
      const name = pipe(
        Array.findFirst(compiled, (link) => link.pos === start.value),
        Option.flatMap((link) => Option.fromUndefinedOr(link.name)),
        Option.filter(() => destination.packageName === undefined),
      );

      if (Option.isSome(name)) {
        const symbol = yield* Names.symbolAt(name.value).pipe(
          Effect.map(Option.flatMap(store.internedSymbol)),
        );

        if (Option.isSome(symbol)) {
          store.name(tag, {
            target: symbol.value,
            quickInfo: Option.none(),
          });
        }
      }
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
  const { ast } = catalogue;
  let documented = true;
  let current: Syntax.Node | undefined = node;

  while (current !== undefined) {
    const symbol = yield* Names.declaredBy(current);
    const entry = pipe(
      symbol,
      Option.flatMap(ast.lookup),
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
const leadsNowhere = (
  ast: AST.Store["Service"],
  target: AST.Target.InternedSymbol,
): boolean => {
  const node = ast.getBySymbol(target);

  // A link names a declaration, which for a type and a namespace of the same name is the type.
  return (
    AST.ExternalItem.isExternalItem(node) && Option.isNone(node.page("type"))
  );
};

/** The syntax a node's comment documents, for a node with a comment. */
const ownerOf = (
  node: AST.Node.Node,
): Option.Option<{
  readonly owner: Syntax.Node;
  readonly documentation: AST.Documentation.Interned;
}> => {
  if (!("node" in node) || AST.Documentation.isDocumentation(node)) {
    return Option.none();
  }

  return Option.map(node.documentation, (documentation) => ({
    owner: node.node,
    documentation,
  }));
};

/**
 * Resolves each link the compiler did not bind, or bound to a name outside the package that no page documents, through the public names of `catalogue`.
 *
 * A package-qualified name starts at its entrypoint. The lookup reads any other name below the public declaration around the comment's owner, then in each enclosing namespace outwards. A comment over a variable statement documents each of its declarators, and resolves in the scope of the first. The compiler can bind a qualified name to something its author did not mean, such as a class's static where the comment names an instance member. A binding a reader cannot follow therefore gives way to the public name. A link in a public declaration's comment that still leads nowhere fails, because a reader would lose its destination. A private declaration's comment keeps such a link as it is, so it fails only where a page shows it.
 */
export const resolve = Effect.fnUntraced(function* (
  catalogue: LinkLookup.Scope["catalogue"],
): Effect.fn.Return<
  void,
  DocumentationError.DocumentationError | Cause.UnknownError,
  TypeScript.Checker.Checker
> {
  const { ast } = catalogue;

  for (const { owner, documentation } of Array.getSomes(
    Array.map(Array.fromIterable(ast.nodes()), ownerOf),
  )) {
    const comment = ast.get(documentation);

    for (const tag of DocSource.linksOf(comment)) {
      const destination = tag.codeDestination;

      if (
        destination !== undefined &&
        Option.isSome(startOf(tag)) &&
        !Option.exists(
          ast.nameOf(tag),
          ({ target }) => !leadsNowhere(ast, target),
        )
      ) {
        const scope = yield* scopeOf(owner, catalogue);
        const target = pipe(
          LinkLookup.reference({ catalogue, owner: scope.owner })(destination),
          Option.flatMap(ast.symbolOf),
        );

        if (Option.isNone(target) && scope.public) {
          return yield* unresolved(
            tag,
            comment.node,
            destination.emitAsTsdoc(),
          );
        }

        if (Option.isSome(target)) {
          ast.name(tag, { target: target.value, quickInfo: Option.none() });
        }
      }
    }
  }
});
