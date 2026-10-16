import { Array, Effect, Option, Record, pipe } from "effect";

import { Analysis } from "./Analysis.js";
import { Sources } from "./Sources.js";
import { TransformError } from "./TransformError.js";

import type { Declarations } from "./Sources.js";

/** Where an aliased name comes from: the module declaring it and its name there. */
interface Alias {
  readonly module: string;
  readonly local: string;
}

// `export { local as name }` takes the name from another module when it re-exports, from an import when the local is one, and from the exporter's own declarations otherwise.
const aliasOf = (
  exporter: string,
  name: string,
): Effect.Effect<Option.Option<Alias>, TransformError, Sources> =>
  Effect.flatMap(Effect.service(Sources), (sources) =>
    sources.scope(exporter).pipe(
      Effect.map(({ reexports, imports }) =>
        pipe(
          Record.get(reexports, name),
          Option.flatMap(({ local, specifier }) =>
            Option.match(specifier, {
              onSome: (from) =>
                sources
                  .resolve(exporter, from)
                  .pipe(Option.map((module) => ({ module, local }))),
              onNone: () =>
                pipe(
                  Record.get(imports, local),
                  Option.flatMap((binding) =>
                    Option.all({
                      module: sources.resolve(exporter, binding.specifier),
                      local: binding.imported,
                    }),
                  ),
                  Option.orElse(() => Option.some({ module: exporter, local })),
                ),
            }),
          ),
        ),
      ),
    ),
  );

const declarationsOf = (
  source: string,
): Effect.Effect<Declarations, TransformError, Analysis | Sources> =>
  Effect.all([Effect.service(Analysis), Effect.service(Sources)]).pipe(
    Effect.flatMap(([analysis, sources]) =>
      analysis.declarationOf(source).pipe(Effect.flatMap(sources.declarations)),
    ),
  );

export interface Options {
  /** The name the member's module exports it under. */
  readonly name: string;
  /** The source module declaring it. */
  readonly source: string;
  /** Modules that may publish it under another name: the declaring module, then the page's. */
  readonly exporters: readonly string[];
}

/**
 * The statements declaring a member, without comments.
 *
 * A member exported under an alias keeps its local declaration, and the export specifier that publishes the alias follows it. The SDK exports `conditional` as `if` this way, because `if` cannot name a function.
 */
export const make = ({
  name,
  source,
  exporters,
}: Options): Effect.Effect<string, TransformError, Analysis | Sources> =>
  declarationsOf(source).pipe(
    Effect.flatMap(({ local }) =>
      Option.match(Record.get(local, name), {
        onSome: (declared) => Effect.succeed(pipe(declared, Array.join("\n"))),
        onNone: () =>
          pipe(
            exporters,
            Effect.forEach((exporter) =>
              Effect.all([
                aliasOf(exporter, name),
                declarationsOf(exporter),
              ]).pipe(
                Effect.map(([alias, { exports }]) =>
                  Option.all({
                    statements: alias.pipe(
                      Option.filter(({ module }) => module === source),
                      Option.flatMap((found) => Record.get(local, found.local)),
                    ),
                    exported: Record.get(exports, name),
                  }),
                ),
              ),
            ),
            Effect.map(Array.getSomes),
            Effect.flatMap(
              Array.match({
                onEmpty: () =>
                  Effect.fail(
                    TransformError.malformedAnalysis(
                      `${source} declares no ${name}`,
                    ),
                  ),
                onNonEmpty: ([{ statements, exported }]) =>
                  Effect.succeed(
                    pipe([...statements, exported], Array.join("\n")),
                  ),
              }),
            ),
          ),
      }),
    ),
  );
