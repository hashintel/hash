import {
  Array,
  Effect,
  Option,
  Path,
  Record,
  String,
  Struct,
  flow,
  pipe,
} from "effect";

import * as References from "./References.js";
import { Sources, parse } from "./Sources.js";
import { TransformError } from "./TransformError.js";

import type { ScopeStatement } from "./Statements.js";

/** The statements declaring a member, with the declaration file they compile in. */
export interface Signature {
  /** The statements, without comments. */
  readonly code: string;
  /** The declaration file's other imports and declarations. Each relative module specifier starts with `#declarations/` instead, which names the directory TypeScript emitted the declaration files into. */
  readonly context: string;
  /** The names the statements refer to, in order. */
  readonly references: readonly References.Reference[];
}

/** Where an aliased name comes from: the module declaring it and its name there. */
interface Alias {
  readonly module: string;
  readonly local: string;
}

// `export { local as name }` takes the name from another module when it re-exports, from an import when the local is one, and from the exporter's own declarations otherwise.
const aliasOf = Effect.fnUntraced(function* (exporter: string, name: string) {
  const sources = yield* Sources;
  const { reexports, imports } = yield* sources.scope(exporter);

  return pipe(
    reexports,
    Record.get(name),
    Option.flatMap(({ local, specifier }) =>
      Option.match(specifier, {
        onSome: (from) =>
          pipe(
            sources.resolve(exporter, from),
            Option.map((module): Alias => ({ module, local })),
          ),
        onNone: () =>
          pipe(
            imports,
            Record.get(local),
            Option.flatMap(
              (binding): Option.Option<Alias> =>
                Option.all({
                  module: sources.resolve(exporter, binding.specifier),
                  local: binding.imported,
                }),
            ),
            Option.orElseSome((): Alias => ({ module: exporter, local })),
          ),
      }),
    ),
  );
});

const statementsText = (statements: readonly ScopeStatement[]): string =>
  pipe(statements, Array.map(Struct.get("text")), Array.join("\n"));

// Each relative specifier keeps naming its module wherever Twoslash compiles the context, through the path the docs site maps `#declarations/` to.
const rewriteSpecifiers = (
  { text, specifiers }: ScopeStatement,
  rewrite: (specifier: string) => string,
): string => {
  const [cursor, pieces] = Array.mapAccum(
    specifiers,
    0,
    (position, { start, end, value }) => [
      end,
      `${text.slice(position, start)}${JSON.stringify(rewrite(value))}`,
    ],
  );

  return `${Array.join(pieces, "")}${text.slice(cursor)}`;
};

export interface Options {
  /** The name the member's module exports it under. */
  readonly name: string;
  /** The source module declaring it. */
  readonly source: string;
  /** The declaration file TypeScript emitted from the source module. */
  readonly declaration: string;
  /** The directory TypeScript emitted the declaration files into, which `#declarations/` names. */
  readonly root: string;
  /** Modules that may publish it under another name: the declaring module, then the page's. */
  readonly exporters: readonly string[];
}

/**
 * The statements declaring a member, without comments, and the rest of their declaration file.
 *
 * A member exported under an alias keeps its local declaration, and an export specifier that publishes the alias follows it. The SDK exports `conditional` as `if` this way, because `if` cannot name a function.
 */
export const make = Effect.fnUntraced(function* ({
  name,
  source,
  declaration,
  root,
  exporters,
}: Options) {
  const sources = yield* Sources;
  const path = yield* Path.Path;

  const { local, statements } = yield* sources.declarations(declaration);

  const shown = yield* Option.match(Record.get(local, name), {
    onSome: (declared) =>
      Effect.succeed({ declared, exported: Option.none<string>() }),
    onNone: () =>
      pipe(
        exporters,
        Effect.forEach((exporter) => aliasOf(exporter, name)),
        Effect.map(
          flow(
            Array.getSomes,
            Array.findFirst((alias) =>
              pipe(
                alias,
                Option.liftPredicate(({ module }) => module === source),
                Option.flatMap(() => Record.get(local, alias.local)),
                Option.map((declared) => ({
                  declared,
                  exported: Option.some(
                    `export { ${alias.local} as ${name} };`,
                  ),
                })),
              ),
            ),
          ),
        ),
        Effect.flatMap(Effect.fromOption),
        Effect.mapError(() =>
          TransformError.malformedAnalysis(`${source} declares no ${name}`),
        ),
      ),
  });

  const code = pipe(
    [statementsText(shown.declared), ...Array.fromOption(shown.exported)],
    Array.join("\n"),
  );
  const { program } = yield* parse(code, declaration);

  const directory = path.relative(root, path.dirname(declaration));
  const rewrite = (specifier: string): string => {
    if (!String.startsWith(".")(specifier)) {
      return specifier;
    }

    return `#declarations/${pipe(path.join(directory, specifier), String.split(path.sep), Array.join("/"))}`;
  };
  const context = pipe(
    statements,
    Array.filter((statement) => !shown.declared.includes(statement)),
    Array.map((statement) => rewriteSpecifiers(statement, rewrite)),
    Array.join("\n"),
  );

  return {
    code,
    context,
    references: References.of(program),
  } satisfies Signature;
});
