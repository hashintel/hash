import { Array, Option, Result, pipe } from "effect";

import * as Content from "./hast-content.js";

import type * as Tree from "../Tree/index.js";
import type * as Output from "./output.js";
import type { Element } from "hast";

type Written<A> = Result.Result<A, Output.Failure>;

const forms =
  (output: Output.Output) =>
  <Origin>(values: readonly Tree.Callable.Form<Origin>[]): Written<Element[]> =>
    output.printed.terms(values).pipe(
      Result.flatMap((terms) =>
        pipe(
          terms,
          Array.map(({ source, applies }) =>
            Content.code(output)({
              source,
              language: Option.some("ts"),
              context: Option.some("type"),
            }).pipe(
              Result.map((code) =>
                Content.element("form")(
                  { overloads: Content.overloads(applies) },
                  [code],
                ),
              ),
            ),
          ),
          Result.all,
        ),
      ),
    );

const described =
  (output: Output.Output) =>
  <Origin>(
    values: readonly Tree.Callable.Described<Origin>[],
  ): Written<Element[]> =>
    pipe(
      values,
      Array.map(({ applies, children }) =>
        Content.blocks(output)(children).pipe(
          Result.map((content) =>
            Content.element("described")(
              { overloads: Content.overloads(applies) },
              content,
            ),
          ),
        ),
      ),
      Result.all,
    );

const parameter =
  (output: Output.Output) =>
  (value: Tree.Callable.Parameter): Written<Element> =>
    Result.all([
      forms(output)(value.forms),
      described(output)(value.descriptions),
    ]).pipe(
      Result.map(([types, descriptions]) =>
        Content.element("parameter")(
          {
            name: value.name,
            optional: Content.flag(value.optional),
            rest: Content.flag(value.rest),
          },
          [...types, ...descriptions],
        ),
      ),
    );

const typeParameter =
  (output: Output.Output) =>
  (value: Tree.Callable.TypeParameter): Written<Element> =>
    described(output)(value.descriptions).pipe(
      Result.map((descriptions) =>
        Content.element("type-parameter")({ name: value.name }, descriptions),
      ),
    );

const returns =
  (output: Output.Output) =>
  (value: Tree.Callable.Returns): Written<Element> =>
    Result.all([
      forms(output)(value.forms),
      described(output)(value.descriptions),
    ]).pipe(
      Result.map(([types, descriptions]) =>
        Content.element("returns")({}, [...types, ...descriptions]),
      ),
    );

const thrown =
  (output: Output.Output) =>
  (value: Tree.Callable.Throw): Written<Element> =>
    Result.gen(function* () {
      const error = yield* pipe(
        value.error,
        Option.map((node) =>
          Content.phrasing(output)(node).pipe(
            Result.map((written) => Content.element("error")({}, written)),
          ),
        ),
        Result.transposeOption,
      );
      const descriptions = yield* described(output)(value.descriptions);

      return Content.element("throw")(
        { overloads: Content.overloads(value.applies) },
        [...Option.toArray(error), ...descriptions],
      );
    });

/** The element `name` around one element for each value, or nothing for no values. */
const list = <A>(
  values: readonly A[],
  {
    name,
    write,
  }: {
    readonly name: string;
    readonly write: (value: A) => Written<Element>;
  },
): Written<Element[]> => {
  if (!Array.isReadonlyArrayNonEmpty(values)) {
    return Result.succeed([]);
  }

  return Result.all(Array.map(values, write)).pipe(
    Result.map((children) => [Content.element(name)({}, children)]),
  );
};

/** What a callable's comments document about its type parameters, parameters, result and errors, each in its own element. */
export const callable =
  (output: Output.Output) =>
  (value: Tree.Callable.Callable): Written<Element[]> =>
    Result.all([
      list(value.typeParameters, {
        name: "type-parameters",
        write: typeParameter(output),
      }),
      list(value.parameters, { name: "parameters", write: parameter(output) }),
      pipe(
        Option.toArray(value.returns),
        Array.map(returns(output)),
        Result.all,
      ),
      list(value.throws, { name: "throws", write: thrown(output) }),
    ]).pipe(Result.map(Array.flatten));
