import { Array, Function, Option, Result, Struct, pipe } from "effect";

import * as Parts from "./internal/parts.js";
import * as References from "./internal/references.js";
import * as Prose from "./Prose.js";
import * as Tree from "./Tree/index.js";

import type * as AST from "./AST/index.js";
import type { DocSection } from "@microsoft/tsdoc";
import type { Equivalence } from "effect";

type OverloadIndex = Tree.Callable.OverloadIndex;
type TypeNode = AST.TypeNode.TypeNode["node"];

/** Each explicit call receives an index. A declaration without calls is one overload, and a getter or a setter is its own call. */
export interface Overload {
  readonly index: OverloadIndex;
  readonly part: Parts.Part;
  readonly call: Option.Option<Tree.Callable.Call>;
  readonly comment: Option.Option<AST.Documentation.Documentation>;
}

/** What numbering and grouping read: the AST with what the names in its types resolve to, and how the comments' prose resolves. */
export interface Context {
  readonly ast: AST.Store["Service"];
  readonly names: References.Names;
  readonly content: Prose.Context;
}

/** The numbered overloads of an export or a member, and what their comments document about the calls. */
export interface Overloads extends Tree.Callable.Callable {
  readonly entries: readonly Overload[];
}

/** A value shared by several overloads, with the overloads and the origins it was found at. */
interface Grouped<A, Origin> {
  readonly value: A;
  readonly overloads: Array.NonEmptyReadonlyArray<OverloadIndex>;
  readonly origins: Array.NonEmptyReadonlyArray<Origin>;
}

/** Joins the overloads that share an equal value, in first-occurrence order. */
const group = <A, Origin>(
  values: readonly (readonly [OverloadIndex, A, Origin])[],
  equivalence: Equivalence.Equivalence<A>,
): Grouped<A, Origin>[] => {
  const groups: Grouped<A, Origin>[] = [];
  for (const [index, value, origin] of values) {
    const existing = Array.findFirstWithIndex(groups, (candidate) =>
      equivalence(candidate.value, value),
    );
    if (Option.isNone(existing)) {
      groups.push({ value, overloads: [index], origins: [origin] });
    } else {
      const [found, position] = existing.value;
      groups[position] = {
        value: found.value,
        overloads: Array.dedupe(Array.append(found.overloads, index)),
        origins: Array.append(found.origins, origin),
      };
    }
  }

  return groups;
};

/** A getter or a setter is the call that reading or writing its member makes. */
const accessed: (source: Parts.Source) => Option.Option<Tree.Callable.Call> =
  Option.liftPredicate(
    (source: Parts.Source): source is AST.Getter.Getter | AST.Setter.Setter =>
      source._tag === "Getter" || source._tag === "Setter",
  );

/**
 * A callable constant's nested comment takes precedence over its enclosing declaration's comment.
 *
 * An overload with neither takes the first documented overload's comment, which authors write once for every overload.
 */
const entriesOf = (
  parts: readonly Parts.Part[],
  ast: AST.Store["Service"],
): Overload[] => {
  const entries = pipe(
    parts,
    Array.flatMap((part) => {
      const own = Option.map(part.source.documentation, ast.get);
      if (part.calls.length === 0) {
        return [{ part, call: accessed(part.source), comment: own }];
      }

      return Array.map(part.calls, (call) => ({
        part,
        call: Option.some<Tree.Callable.Call>(call),
        comment: Option.map(call.documentation, ast.get).pipe(
          Option.orElse(() => own),
        ),
      }));
    }),
    Array.map((entry, position) =>
      Struct.assign(entry, {
        index: Tree.Callable.OverloadIndex(position + 1),
      }),
    ),
  );
  const first = Array.findFirst(entries, ({ comment }) => comment);

  return Array.map(entries, (entry) =>
    Struct.assign(entry, {
      comment: Option.orElse(entry.comment, () => first),
    }),
  );
};

/** One block of a comment, distilled. */
interface Block<Origin> {
  readonly origin: Origin;
  readonly blocks: readonly Tree.Prose.Block[];
}

/** What one overload's comment documents about its call. */
interface Documented {
  readonly index: OverloadIndex;
  readonly parameters: readonly Block<AST.Documentation.Parameter.Parameter>[];
  readonly typeParameters: readonly Block<AST.Documentation.TypeParameter.TypeParameter>[];
  readonly returns: Option.Option<Block<AST.Documentation.Returns.Returns>>;
  readonly throws: readonly Block<AST.Documentation.Throws.Throws>[];
}

const blockOf =
  (context: Prose.Context) =>
  <Origin extends { readonly content: DocSection }>(
    origin: Origin,
  ): Result.Result<Block<Origin>, Prose.ProseError> =>
    Prose.blocks(origin.content, context).pipe(
      Result.map((blocks) => ({ origin, blocks })),
    );

/** What each overload's comment documents about the names it declares. An overload that takes another's comment leaves out a parameter or type parameter it does not declare. */
const documentedOf = (
  entries: readonly Overload[],
  { ast, content }: Context,
): Result.Result<Documented[], Prose.ProseError> =>
  pipe(
    entries,
    Array.flatMap((entry) =>
      pipe(
        entry.comment,
        Option.map((documentation) =>
          Result.gen(function* () {
            const distil = blockOf(content);
            const declared = Parts.declared(
              ast,
              Option.getOrElse(
                entry.call,
                (): Parts.Source => entry.part.source,
              ),
            );

            return {
              index: entry.index,
              parameters: yield* Result.all(
                Array.map(
                  Array.filter(documentation.parameters, ({ name }) =>
                    declared.parameters.includes(name),
                  ),
                  distil,
                ),
              ),
              typeParameters: yield* Result.all(
                Array.map(
                  Array.filter(documentation.typeParameters, ({ name }) =>
                    declared.typeParameters.includes(name),
                  ),
                  distil,
                ),
              ),
              returns: yield* Result.transposeOption(
                Option.map(documentation.returns, distil),
              ),
              throws: yield* Result.all(
                Array.map(documentation.throws, distil),
              ),
            } satisfies Documented;
          }),
        ),
        Option.toArray,
      ),
    ),
    Result.all,
  );

const describedOf = <Origin>(
  grouped: readonly Grouped<readonly Tree.Prose.Block[], Origin>[],
  total: number,
): Tree.Callable.Described<Origin>[] =>
  Array.map(grouped, ({ value, overloads, origins }) => ({
    type: "described",
    applies: Tree.Callable.applies({ overloads, total }),
    children: value,
    origin: origins,
  }));

const formsOf = <Origin>(
  grouped: readonly Grouped<TypeNode, Origin>[],
  total: number,
): Tree.Callable.Form<Origin>[] =>
  Array.map(grouped, ({ value, overloads, origins }) => ({
    applies: Tree.Callable.applies({ overloads, total }),
    origins,
    type: value,
  }));

/** The blocks of each documented name, across the overloads that document it, in first-occurrence order. */
const named = <Origin extends { readonly name: string }>(
  documented: readonly Documented[],
  select: (value: Documented) => readonly Block<Origin>[],
): (readonly [
  string,
  Array.NonEmptyReadonlyArray<readonly [OverloadIndex, Block<Origin>]>,
])[] => {
  const pairs = Array.flatMap(documented, (value) =>
    Array.map(select(value), (block) => [value.index, block] as const),
  );
  const names = Array.dedupe(
    Array.map(pairs, ([, block]) => block.origin.name),
  );

  return Array.flatMap(names, (name) => {
    const blocks = Array.filter(
      pairs,
      ([, block]) => block.origin.name === name,
    );

    return Array.isReadonlyArrayNonEmpty(blocks)
      ? [[name, blocks] as const]
      : [];
  });
};

/** Equal types have the same spelling and resolve the same, so equal spellings of different types stay apart. */
const typeEquivalence = (
  names: References.Names,
): Equivalence.Equivalence<TypeNode> => {
  const syntax = References.syntax(names);
  return (self, that) => syntax([self], [that]);
};

const parametersOf = (
  entries: readonly Overload[],
  documented: readonly Documented[],
  { ast, names }: Context,
): Tree.Callable.Parameter[] =>
  Array.map(
    named(documented, ({ parameters }) => parameters),
    ([name, blocks]) => {
      const declared = Array.flatMap(entries, ({ index, call }) =>
        pipe(
          call,
          Option.toArray,
          Array.flatMap(({ parameters }) => Array.fromIterable(parameters)),
          Array.map((id) => ast.get(id)),
          Array.filter((parameter) => parameter.name === name),
          Array.map((parameter) => [index, parameter] as const),
        ),
      );
      const declarations = Array.map(declared, ([, parameter]) => parameter);

      return {
        type: "parameter",
        name,
        declarations,
        optional:
          Array.isReadonlyArrayNonEmpty(declarations) &&
          Array.every(declarations, (parameter) => parameter.optional),
        rest: Array.some(declarations, (parameter) => parameter.rest),
        forms: formsOf(
          group(
            Array.flatMap(declared, ([index, parameter]) =>
              pipe(
                parameter.type,
                Option.map(
                  (type) => [index, ast.get(type).node, parameter] as const,
                ),
                Option.toArray,
              ),
            ),
            typeEquivalence(names),
          ),
          entries.length,
        ),
        descriptions: describedOf(
          group(
            Array.map(
              blocks,
              ([index, block]) => [index, block.blocks, block.origin] as const,
            ),
            Tree.Prose.equivalence,
          ),
          entries.length,
        ),
        origin: Array.map(blocks, ([, block]) => block.origin),
      };
    },
  );

const typeParametersOf = (
  entries: readonly Overload[],
  documented: readonly Documented[],
): Tree.Callable.TypeParameter[] =>
  Array.map(
    named(documented, ({ typeParameters }) => typeParameters),
    ([name, blocks]) => ({
      type: "typeParameter",
      name,
      descriptions: describedOf(
        group(
          Array.map(
            blocks,
            ([index, block]) => [index, block.blocks, block.origin] as const,
          ),
          Tree.Prose.equivalence,
        ),
        entries.length,
      ),
      origin: Array.map(blocks, ([, block]) => block.origin),
    }),
  );

const returnsOf = (
  entries: readonly Overload[],
  documented: readonly Documented[],
  { ast, names }: Context,
): Option.Option<Tree.Callable.Returns> => {
  const blocks = Array.flatMap(documented, ({ index, returns }) =>
    Array.map(Option.toArray(returns), (block) => [index, block] as const),
  );
  if (!Array.isReadonlyArrayNonEmpty(blocks)) {
    return Option.none();
  }

  return Option.some({
    type: "returns",
    forms: formsOf(
      group(
        Array.flatMap(entries, ({ index, call }) =>
          pipe(
            call,
            Option.flatMap((value) =>
              Option.map(
                value.returns,
                (type) => [index, ast.get(type).node, value] as const,
              ),
            ),
            Option.toArray,
          ),
        ),
        typeEquivalence(names),
      ),
      entries.length,
    ),
    descriptions: describedOf(
      group(
        Array.map(
          blocks,
          ([index, block]) => [index, block.blocks, block.origin] as const,
        ),
        Tree.Prose.equivalence,
      ),
      entries.length,
    ),
    origin: Array.map(blocks, ([, block]) => block.origin),
  });
};

type Error = Tree.Prose.InlineCode | Tree.Prose.Link;

interface Thrown {
  readonly error: Option.Option<Error>;
  readonly description: readonly Tree.Prose.Block[];
}

const isError = (node: Tree.Prose.Phrasing): node is Error =>
  node.type === "inlineCode" ||
  (node.type === "link" &&
    node.children.length === 1 &&
    node.children[0]?.type === "inlineCode");

/** A leading code name, or a link whose label is code, names the error without losing its destination. */
const thrownOf = (blocks: readonly Tree.Prose.Block[]): Thrown => {
  const [first, ...rest] = blocks;
  if (first?.type !== "paragraph") {
    return { error: Option.none(), description: blocks };
  }

  const [error, ...content] = first.children;
  if (error === undefined || !isError(error)) {
    return { error: Option.none(), description: blocks };
  }

  const description = Prose.trim(content);
  if (description.length === 0) {
    return { error: Option.some(error), description: rest };
  }

  return {
    error: Option.some(error),
    description: Array.prepend(rest, { ...first, children: description }),
  };
};

const errorEquivalence = Option.makeEquivalence<Error>((self, that) =>
  Tree.Prose.phrasing([self], [that]),
);

const throwsOf = (
  entries: readonly Overload[],
  documented: readonly Documented[],
): Tree.Callable.Throw[] => {
  const thrown = Array.flatMap(documented, ({ index, throws: blocks }) =>
    Array.map(blocks, (block) => ({
      index,
      origin: block.origin,
      value: thrownOf(block.blocks),
    })),
  );

  return pipe(
    group(
      Array.map(
        thrown,
        ({ index, origin, value }) => [index, value, origin] as const,
      ),
      (self, that) => errorEquivalence(self.error, that.error),
    ),
    Array.map(({ value, overloads, origins }): Tree.Callable.Throw => {
      const matching = Array.filter(thrown, (candidate) =>
        errorEquivalence(candidate.value.error, value.error),
      );

      return {
        type: "throw",
        error: value.error,
        applies: Tree.Callable.applies({ overloads, total: entries.length }),
        descriptions: describedOf(
          group(
            Array.map(
              matching,
              (candidate) =>
                [
                  candidate.index,
                  candidate.value.description,
                  candidate.origin,
                ] as const,
            ),
            Tree.Prose.equivalence,
          ),
          overloads.length,
        ),
        origin: origins,
      };
    }),
  );
};

/** Numbers the overloads of `parts` and groups what their comments document, without conflating equal spellings of different types. */
export const collect: {
  (
    context: Context,
  ): (
    parts: readonly Parts.Part[],
  ) => Result.Result<Overloads, Prose.ProseError>;
  (
    parts: readonly Parts.Part[],
    context: Context,
  ): Result.Result<Overloads, Prose.ProseError>;
} = Function.dual(2, (parts: readonly Parts.Part[], context: Context) =>
  Result.gen(function* () {
    const entries = entriesOf(parts, context.ast);
    const documented = yield* documentedOf(entries, context);

    return {
      entries,
      typeParameters: typeParametersOf(entries, documented),
      parameters: parametersOf(entries, documented, context),
      returns: returnsOf(entries, documented, context),
      throws: throwsOf(entries, documented),
    };
  }),
);
