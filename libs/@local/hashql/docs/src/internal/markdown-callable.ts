import { Array, Option, Result, pipe } from "effect";

import * as Content from "./markdown-content.js";
import * as Output from "./output.js";
import * as Titles from "./titles.js";

import type * as Tree from "../Tree/index.js";
import type { PhrasingContent, RootContent } from "mdast";

type Written<A> = Result.Result<A, Output.Failure>;

/** A type as printed, with the note of the overloads it holds in when it does not hold in all of them. */
interface Typed {
  readonly type: string;
  readonly note: Option.Option<string>;
}

const typesOf =
  (output: Output.Output) =>
  <Origin>(forms: readonly Tree.Callable.Form<Origin>[]): Written<Typed[]> =>
    output.printed.terms(forms).pipe(
      Result.map(
        Array.map(({ source, applies }): Typed => ({
          type: source.text,
          note: Option.map(Output.overloads(applies), Content.note),
        })),
      ),
    );

const listed = (types: readonly Typed[]): PhrasingContent[] =>
  pipe(
    types,
    Array.map(({ type, note }): PhrasingContent[] => [
      Content.inlineCode(type),
      ...Array.map(Option.toArray(note), (value) => Content.text(` ${value}`)),
    ]),
    Array.intersperse([Content.text(", ")]),
    Array.flatten,
  );

/** An item's line: `name: type` when one type holds in every overload, and otherwise the name followed by each type and its overloads. */
const line = (
  name: Option.Option<string>,
  types: readonly Typed[],
): PhrasingContent[] => {
  const [only] = types;
  if (types.length === 1 && only !== undefined && Option.isNone(only.note)) {
    const written = Option.match(name, {
      onNone: () => only.type,
      onSome: (value) => `${value}: ${only.type}`,
    });

    return [Content.inlineCode(written)];
  }

  if (Option.isNone(name)) {
    return listed(types);
  }

  if (types.length === 0) {
    return [Content.inlineCode(name.value)];
  }

  return [Content.inlineCode(name.value), Content.text(": "), ...listed(types)];
};

const described =
  (output: Output.Output) =>
  <Origin>(
    descriptions: readonly Tree.Callable.Described<Origin>[],
  ): Written<RootContent[]> =>
    pipe(
      descriptions,
      Array.map(({ applies, children }) =>
        Content.blocks(output)(children).pipe(
          Result.map(Content.noted(applies)),
        ),
      ),
      Result.all,
      Result.map(Array.flatten),
    );

const item = (
  head: readonly PhrasingContent[],
  body: readonly RootContent[],
): RootContent[] => {
  if (head.length === 0) {
    return Array.copy(body);
  }

  return Array.prepend(body, { type: "paragraph", children: Array.copy(head) });
};

/** A parameter's name as a call writes it: `...rest` for one that collects the remaining arguments, `name?` for one a call may omit. */
const nameOf = ({ name, rest, optional }: Tree.Callable.Parameter): string =>
  [rest ? "..." : "", name, optional ? "?" : ""].join("");

const parameter =
  (output: Output.Output) =>
  (value: Tree.Callable.Parameter): Written<RootContent[]> =>
    Result.gen(function* () {
      const types = yield* typesOf(output)(value.forms);
      const body = yield* described(output)(value.descriptions);

      return item(line(Option.some(nameOf(value)), types), body);
    });

const typeParameter =
  (output: Output.Output) =>
  (value: Tree.Callable.TypeParameter): Written<RootContent[]> =>
    described(output)(value.descriptions).pipe(
      Result.map((body) => item([Content.inlineCode(value.name)], body)),
    );

const returns =
  (output: Output.Output) =>
  (value: Tree.Callable.Returns): Written<RootContent[]> =>
    Result.gen(function* () {
      const types = yield* typesOf(output)(value.forms);
      const body = yield* described(output)(value.descriptions);

      return item(line(Option.none(), types), body);
    });

const thrown =
  (output: Output.Output) =>
  (value: Tree.Callable.Throw): Written<RootContent[]> =>
    Result.gen(function* () {
      const error = yield* pipe(
        value.error,
        Option.map(Content.phrasing(output)),
        Result.transposeOption,
      );
      const head = Option.match(error, {
        onNone: (): PhrasingContent[] => [],
        onSome: (nodes) => [
          ...nodes,
          ...Array.map(
            Option.toArray(Output.overloads(value.applies)),
            (values) => Content.text(` ${Content.note(values)}`),
          ),
        ],
      });
      const body = yield* described(output)(value.descriptions);

      return item(head, body);
    });

const list = <A>(
  values: readonly A[],
  {
    title,
    write,
  }: {
    readonly title: string;
    readonly write: (value: A) => Written<RootContent[]>;
  },
): Written<RootContent[]> =>
  pipe(
    values,
    Array.map(write),
    Result.all,
    Result.map((items) => Content.section(Array.flatten(items), title)),
  );

/** What a callable's comments document about its type parameters, parameters, result and errors, each under its label. */
export const callable =
  (output: Output.Output) =>
  (value: Tree.Callable.Callable): Written<RootContent[]> =>
    Result.all([
      list(value.typeParameters, {
        title: Titles.sections.typeParameters,
        write: typeParameter(output),
      }),
      list(value.parameters, {
        title: Titles.sections.parameters,
        write: parameter(output),
      }),
      list(Option.toArray(value.returns), {
        title: Titles.sections.returns,
        write: returns(output),
      }),
      list(value.throws, {
        title: Titles.sections.throws,
        write: thrown(output),
      }),
    ]).pipe(Result.map(Array.flatten));
