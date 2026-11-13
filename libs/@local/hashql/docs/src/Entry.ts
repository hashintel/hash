import {
  Array,
  Equal,
  Function,
  Match,
  Option,
  Result,
  Struct,
  pipe,
} from "effect";

import * as Catalogue from "./Catalogue.js";
import * as Content from "./Content.js";
import * as Parts from "./internal/parts.js";
import * as References from "./internal/references.js";
import * as Syntax from "./internal/signature-syntax.js";
import * as Overloads from "./Overloads.js";
import * as Tree from "./Tree/index.js";

import type * as AST from "./AST/index.js";

/** The declarations of an export or a member, the comments on them and what those comments document about its calls. */
interface Group extends Tree.Callable.Callable {
  readonly signatures: Option.Option<Tree.Declaration.Signatures>;
  readonly comments: readonly Tree.Comment.Comment[];
  /** Every overload's comment carries `@deprecated`. */
  readonly deprecated: boolean;
}

/** What distilling an export reads: what numbering its overloads reads, with each example's program besides. */
export interface Context extends Overloads.Context {
  readonly content: Content.Context;
}

/** The context the AST holds, built once for every export of the reference. */
export const contextOf = (ast: AST.Store["Service"]): Context => ({
  ast,
  names: References.namesOf(ast),
  content: Content.contextOf(ast),
});

export type Failure = Content.Failure;

const sourceKind: (source: Parts.Source) => Tree.Export.Kind =
  Match.type<Parts.Source>().pipe(
    Match.tags({
      ClassDeclaration: () => "class" as const,
      EnumDeclaration: () => "enum" as const,
      InterfaceDeclaration: () => "interface" as const,
      TypeAliasDeclaration: () => "type" as const,
      ConstantDeclaration: () => "const" as const,
      FunctionDeclaration: () => "function" as const,
      CallSignature: () => "function" as const,
      ConstructSignature: () => "function" as const,
      Property: () => "const" as const,
      Method: () => "function" as const,
      Getter: () => "const" as const,
      Setter: () => "const" as const,
      EnumMember: () => "const" as const,
      IndexSignature: () => "const" as const,
    }),
    Match.exhaustive,
  );

/** What an export declares by its first declaration. One without declarations is only a namespace, which is an entrypoint at an entrypoint's root. */
const kindOf = (
  origin: Catalogue.Entry,
  parts: readonly Parts.Part[],
): Tree.Export.Kind =>
  pipe(
    Array.head(parts),
    Option.map(({ source }) => sourceKind(source)),
    Option.getOrElse(() =>
      origin.name.path.length === 0 ? "entrypoint" : "module",
    ),
  );

const contentOf = (
  documentation: Option.Option<AST.Documentation.Interned>,
  context: Context,
): Result.Result<Option.Option<Content.Content>, Failure> =>
  pipe(
    documentation,
    Option.map((id) =>
      Content.fromDocumentation(context.ast.get(id), context.content),
    ),
    Result.transposeOption,
  );

/** Distils each comment once, however many parts and overloads of a group it documents. */
const distiller = (
  context: Context,
): ((
  documentation: AST.Documentation.Documentation,
) => Result.Result<Content.Content, Failure>) => {
  const distilled = new WeakMap<
    AST.Documentation.Documentation,
    Content.Content
  >();

  return (documentation) => {
    const known = distilled.get(documentation);

    if (known !== undefined) {
      return Result.succeed(known);
    }

    return Content.fromDocumentation(documentation, context.content).pipe(
      Result.map((content) => {
        distilled.set(documentation, content);

        return content;
      }),
    );
  };
};

/** One comment per source comment, documenting every overload it was found on. */
const commentsOf = (
  documented: readonly (readonly [
    Content.Content,
    Array.NonEmptyReadonlyArray<Tree.Callable.OverloadIndex>,
  ])[],
  total: number,
): Tree.Comment.Comment[] => {
  const comments: (readonly [
    Content.Content,
    Array.NonEmptyReadonlyArray<Tree.Callable.OverloadIndex>,
  ])[] = [];
  for (const [content, overloads] of documented) {
    const existing = Array.findFirstWithIndex(comments, ([candidate]) =>
      Equal.equals(candidate.origin, content.origin),
    );
    if (Option.isNone(existing)) {
      comments.push([content, overloads]);
    } else {
      const [[previous, known], position] = existing.value;
      comments[position] = [
        previous,
        Array.dedupe(Array.appendAll(known, overloads)),
      ];
    }
  }

  return Array.map(comments, ([content, overloads]) =>
    Content.documenting(content, Tree.Callable.applies({ overloads, total })),
  );
};

const signatureOf = (
  part: Parts.Part,
  {
    exported,
    overloads,
    content,
  }: {
    readonly exported: Option.Option<Syntax.Exported>;
    readonly overloads: readonly Overloads.Overload[];
    readonly content: Option.Option<Content.Content>;
  },
): Option.Option<Tree.Declaration.Signature> =>
  pipe(
    overloads,
    Array.filter((entry) => entry.part === part),
    Array.map(({ index, call }): Tree.Declaration.Overload => ({
      type: "overload",
      index,
      origin: Option.getOrElse(
        call,
        (): Tree.Declaration.Overload["origin"] => part.source,
      ),
    })),
    Option.liftPredicate(
      Array.isReadonlyArrayNonEmpty<Tree.Declaration.Overload>,
    ),
    Option.map((numbered): Tree.Declaration.Signature => ({
      type: "signature",
      syntax: Syntax.project(part, { exported }),
      overloads: numbered,
      facts: Option.map(content, ({ facts }) => facts),
      origin: part.source,
    })),
  );

const groupOf = (
  parts: readonly Parts.Part[],
  {
    exported,
    context,
  }: {
    readonly exported: Option.Option<Syntax.Exported>;
    readonly context: Context;
  },
): Result.Result<Group, Failure> =>
  Result.gen(function* () {
    const overloads = yield* Overloads.collect(parts, context);
    const total = overloads.entries.length;
    const signatures: Tree.Declaration.Signature[] = [];
    const documented: (readonly [
      Content.Content,
      Array.NonEmptyReadonlyArray<Tree.Callable.OverloadIndex>,
    ])[] = [];

    const distil = distiller(context);

    for (const part of parts) {
      const content = yield* pipe(
        part.source.documentation,
        Option.map((id) => distil(context.ast.get(id))),
        Result.transposeOption,
      );
      const signature = signatureOf(part, {
        exported,
        overloads: overloads.entries,
        content,
      });
      for (const value of Option.toArray(signature)) {
        signatures.push(value);
        for (const own of Option.toArray(content)) {
          documented.push([
            own,
            Array.map(value.overloads, ({ index }) => index),
          ]);
        }
      }
    }

    for (const entry of overloads.entries) {
      const content = yield* pipe(
        entry.comment,
        Option.map(distil),
        Result.transposeOption,
      );
      for (const value of Option.toArray(content)) {
        documented.push([value, [entry.index]]);
      }
    }

    return {
      signatures: pipe(
        signatures,
        Option.liftPredicate(
          Array.isReadonlyArrayNonEmpty<Tree.Declaration.Signature>,
        ),
        Option.map((children): Tree.Declaration.Signatures => ({
          type: "signatures",
          children,
          origin: Array.map(children, ({ origin }) => origin),
        })),
      ),
      comments: commentsOf(documented, total),
      deprecated:
        total > 0 &&
        Array.every(overloads.entries, ({ comment }) =>
          Option.exists(comment, (documentation) =>
            Option.isSome(documentation.deprecated),
          ),
        ),
      typeParameters: overloads.typeParameters,
      parameters: overloads.parameters,
      returns: overloads.returns,
      throws: overloads.throws,
    };
  });

const callsOf = (group: Group): Tree.Callable.Callable =>
  Struct.pick(group, ["typeParameters", "parameters", "returns", "throws"]);

/** A getter or a setter as a group of its own, so its comment documents it alone and it numbers no overloads. */
const halfOf = <
  Type extends string,
  Origin extends AST.Getter.Getter | AST.Setter.Setter,
>(
  type: Type,
  origin: Origin,
  context: Context,
): Result.Result<Option.Option<Tree.Member.Half<Type, Origin>>, Failure> =>
  groupOf([{ source: origin, calls: [] }], {
    exported: Option.none(),
    context,
  }).pipe(
    Result.map((group) =>
      pipe(
        group.signatures,
        Option.flatMap(({ children }) => Array.head(children)),
        Option.map((signature) => ({
          ...callsOf(group),
          type,
          signature,
          comment: Array.head(group.comments),
          origin,
        })),
      ),
    ),
  );

const accessorOf = (
  member: Parts.Member,
  origin: AST.Accessor.Accessor,
  context: Context,
): Result.Result<Option.Option<Tree.Member.Accessor>, Failure> =>
  pipe(
    member.parts,
    Array.map(({ source }) =>
      Match.value(source).pipe(
        Match.withReturnType<
          Result.Result<
            Option.Option<Tree.Member.Getter | Tree.Member.Setter>,
            Failure
          >
        >(),
        Match.tag("Getter", (getter) => halfOf("getter", getter, context)),
        Match.tag("Setter", (setter) => halfOf("setter", setter, context)),
        Match.orElse(() => Result.succeedNone),
      ),
    ),
    Result.all,
    Result.map(Array.getSomes),
    Result.map(
      Option.liftPredicate(
        Array.isReadonlyArrayNonEmpty<Tree.Member.Getter | Tree.Member.Setter>,
      ),
    ),
    Result.map(
      Option.map((halves): Tree.Member.Accessor => {
        const documented = Array.getSomes(
          Array.map(halves, ({ comment }) => comment),
        );

        return {
          type: "accessor",
          id: member.id,
          name: member.name,
          static: member.static,
          deprecated:
            Array.isReadonlyArrayNonEmpty(documented) &&
            Array.every(documented, ({ facts }) =>
              Option.isSome(facts.deprecation),
            ),
          halves,
          origin,
        };
      }),
    ),
  );

/** A member as the node of its kind, or none for a kind that its owner's declaration documents instead. */
const memberOf = (
  member: Parts.Member,
  context: Context,
): Result.Result<Option.Option<Tree.Member.Member>, Failure> => {
  const origin = context.ast.get(member.id);
  if (origin._tag === "Accessor") {
    return accessorOf(member, origin, context);
  }

  return groupOf(member.parts, { exported: Option.none(), context }).pipe(
    Result.map((group) => {
      const shared = {
        ...callsOf(group),
        id: member.id,
        name: member.name,
        static: member.static,
        comments: group.comments,
        deprecated: group.deprecated,
      };

      return Match.value(origin).pipe(
        Match.withReturnType<Option.Option<Tree.Member.Member>>(),
        Match.tag("Property", (value) =>
          Option.map(group.signatures, (signatures) => ({
            ...shared,
            type: "property" as const,
            signatures,
            origin: value,
          })),
        ),
        Match.tag("Method", "Constructor", (value) =>
          Option.map(group.signatures, (signatures) => ({
            ...shared,
            type: "method" as const,
            signatures,
            origin: value,
          })),
        ),
        Match.tag("EnumMember", (value) =>
          Option.map(group.signatures, (signatures) => ({
            ...shared,
            type: "enumMember" as const,
            signatures,
            origin: value,
          })),
        ),
        // Their owner's declaration documents these.
        Match.tag("CallSignature", "ConstructSignature", "IndexSignature", () =>
          Option.none(),
        ),
        Match.exhaustive,
      );
    }),
  );
};

/** The comment an index summarises an export by: its first declaration's, or a namespace-only declaration's own. */
export const summary = (
  own: Pick<Tree.Export.Own, "comments" | "namespace">,
): Option.Option<Tree.Comment.Comment> =>
  Array.head(own.comments).pipe(
    Option.orElse(() =>
      Option.flatMap(own.namespace, ({ comment }) => comment),
    ),
  );

/** One export of `origin`: declarations the reference documents together, with their members and comments. */
const exportOf =
  (origin: Catalogue.Entry, context: Context) =>
  (
    meaning: Tree.Export.Own["meaning"],
    parts: readonly Parts.Part[],
  ): Result.Result<Tree.Export.Own, Failure> =>
    Result.gen(function* () {
      const { ast } = context;
      const group = yield* groupOf(parts, {
        exported: Option.some({
          entry: origin,
          names: Catalogue.namesOf(ast, origin),
        }),
        context,
      });
      const members = yield* pipe(
        Parts.members(parts, { ast, entry: origin }),
        Array.map((member) => memberOf(member, context)),
        Result.all,
        Result.map(Array.getSomes),
      );

      const namespace = yield* pipe(
        ast.get(origin.id).namespace,
        Option.filter(() => !Option.contains(meaning, "value")),
        Option.map(ast.get),
        Option.map((value) =>
          contentOf(value.documentation, context).pipe(
            Result.map((content): Tree.Export.OwnNamespace => ({
              type: "namespace",
              comment: Option.map(
                content,
                Content.documenting(Tree.Callable.whole),
              ),
              origin: value,
            })),
          ),
        ),
        Result.transposeOption,
      );

      return {
        ...group,
        type: "export",
        kind: kindOf(origin, parts),
        meaning,
        members,
        namespace,
        // A declaration that is only a namespace has no overloads, so its namespace's comment decides.
        deprecated: Option.match(group.signatures, {
          onSome: () => group.deprecated,
          onNone: () =>
            Option.exists(
              summary({ comments: group.comments, namespace }),
              ({ facts }) => Option.isSome(facts.deprecation),
            ),
        }),
        origin,
      };
    });

type Exports = Result.Result<readonly Tree.Export.Own[], Failure>;

/** Distils every declaration, member and comment of a public declaration without borrowing another declaration's prose. A type and a value declared apart are two exports, the type first, and any other declaration is one. */
export const from: {
  (context: Context): (origin: Catalogue.Entry) => Exports;
  (origin: Catalogue.Entry, context: Context): Exports;
} = Function.dual(2, (origin: Catalogue.Entry, context: Context): Exports => {
  const distil = exportOf(origin, context);

  return Parts.matchDocumented(Parts.documented(context.ast, origin), {
    Whole: ({ parts }) => Result.map(distil(Option.none(), parts), Array.of),
    // The value is an export of its own, under the shortest name that permits value use.
    Apart: ({ type, value }) =>
      Result.all([
        distil(Option.some("type"), type),
        exportOf(
          Option.getOrElse(Catalogue.valued(origin), () => origin),
          context,
        )(Option.some("value"), value),
      ]),
  });
});
