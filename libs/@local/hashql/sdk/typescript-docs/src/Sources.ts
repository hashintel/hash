import {
  Array,
  Cache,
  Context,
  Effect,
  FileSystem,
  Filter,
  Function,
  Layer,
  Option,
  Record,
  Struct,
  Tuple,
  flow,
  pipe,
} from "effect";
import { parseSync } from "oxc-parser";
import { ResolverFactory } from "oxc-resolver";

import {
  boundNames,
  declarationOf,
  declaredNames,
  isExportAll,
  isExportNamed,
  isImport,
  specifierLiterals,
  statementText,
} from "./Statements.js";
import { TransformError } from "./TransformError.js";

import type { File, ScopeStatement } from "./Statements.js";
import type {
  Comment,
  ImportDeclarationSpecifier,
  ModuleExportName,
  Program,
  Statement,
} from "oxc-parser";

/** A name an import declaration brings into a module's scope. */
export interface Binding {
  readonly specifier: string;
  /** The imported export, `None` for a namespace import. */
  readonly imported: Option.Option<string>;
}

/** A name an export specifier publishes. */
export interface Reexport {
  readonly local: string;
  /** The module it is re-exported from, `None` for a binding of the exporting module. */
  readonly specifier: Option.Option<string>;
}

/** The names a module imports and exports, and its block comments. */
export interface Scope {
  readonly text: string;
  readonly imports: Record.ReadonlyRecord<string, Binding>;
  /** Specifiers of `export * from`, in source order. */
  readonly wildcards: readonly string[];
  /** Specifiers of `export * as`, by exported name. */
  readonly namespaces: Record.ReadonlyRecord<string, string>;
  /** Export specifiers, by exported name. */
  readonly reexports: Record.ReadonlyRecord<string, Reexport>;
  readonly comments: readonly Comment[];
}

/** The statements of a declaration file that bring names into its scope. */
export interface Declarations {
  /** The statements declaring each top-level name, without comments. Overloads share an entry. */
  readonly local: Record.ReadonlyRecord<
    string,
    Array.NonEmptyReadonlyArray<ScopeStatement>
  >;
  /** Every import and declaration, in source order. */
  readonly statements: readonly ScopeStatement[];
}

/** A module's syntax tree and comments. */
export type Parsed = Pick<ReturnType<typeof parseSync>, "program" | "comments">;

/** Parses TypeScript with oxc, failing with every syntax error it reports. The file's name selects the dialect, such as a declaration file's. */
export const parse: {
  (file: string): (text: string) => Effect.Effect<Parsed, TransformError>;
  (text: string, file: string): Effect.Effect<Parsed, TransformError>;
} = Function.dual(
  2,
  (text: string, file: string): Effect.Effect<Parsed, TransformError> => {
    const { program, comments, errors } = parseSync(file, text);

    return Array.match(errors, {
      onEmpty: () => Effect.succeed({ program, comments }),
      onNonEmpty: (failures) =>
        Effect.fail(
          TransformError.sourceSyntax(
            file,
            Array.map(failures, Struct.get("message")),
          ),
        ),
    });
  },
);

const exportName = (name: ModuleExportName): string => {
  if (name.type === "Literal") {
    return name.value;
  }

  return name.name;
};

const importedName = (
  specifier: ImportDeclarationSpecifier,
): Option.Option<string> => {
  if (specifier.type === "ImportSpecifier") {
    return Option.some(exportName(specifier.imported));
  }

  if (specifier.type === "ImportDefaultSpecifier") {
    return Option.some("default");
  }

  return Option.none();
};

const collectScope = (program: Program): Omit<Scope, "text" | "comments"> => {
  const exportsAll = Array.filter(program.body, isExportAll);

  return {
    imports: pipe(
      program.body,
      Array.filter(isImport),
      Array.flatMap((statement) =>
        Array.map(
          statement.specifiers,
          (specifier) =>
            [
              specifier.local.name,
              {
                specifier: statement.source.value,
                imported: importedName(specifier),
              },
            ] as const,
        ),
      ),
      Record.fromEntries,
    ),
    wildcards: pipe(
      exportsAll,
      Array.filter(({ exported }) => exported === null),
      Array.map(({ source }) => source.value),
    ),
    namespaces: pipe(
      exportsAll,
      Array.filterMap(
        Filter.fromPredicateOption(({ exported, source }) =>
          pipe(
            exported,
            Option.fromNullishOr,
            Option.map((name) => [exportName(name), source.value] as const),
          ),
        ),
      ),
      Record.fromEntries,
    ),
    reexports: pipe(
      program.body,
      Array.filter(isExportNamed),
      Array.flatMap((statement) =>
        Array.map(
          statement.specifiers,
          (specifier) =>
            [
              exportName(specifier.exported),
              {
                local: exportName(specifier.local),
                specifier: Option.fromNullishOr(statement.source?.value),
              },
            ] as const,
        ),
      ),
      Record.fromEntries,
    ),
  };
};

const collectDeclarations = (
  text: string,
  { program, comments }: Parsed,
): Declarations => {
  const file: File = { text, comments, literals: specifierLiterals(program) };
  const scoped = Array.filterMap(
    program.body,
    Filter.fromPredicateOption((statement) =>
      pipe(
        statement,
        boundNames,
        Option.map((names): readonly [Statement, ScopeStatement] => [
          statement,
          { names, ...statementText(statement, file) },
        ]),
      ),
    ),
  );

  return {
    local: pipe(
      scoped,
      Array.flatMap(([statement, scope]) =>
        pipe(
          declarationOf(statement),
          Array.fromOption,
          Array.flatMap(declaredNames),
          Array.map((name) => ({ name, scope })),
        ),
      ),
      Array.groupBy(Struct.get("name")),
      Record.map(Array.map(Struct.get("scope"))),
    ),
    statements: Array.map(scoped, Tuple.get(1)),
  };
};

/** Reads TypeScript modules with oxc, each file once per run, and resolves their specifiers. */
export class Sources extends Context.Service<
  Sources,
  {
    /** The imports, re-exports and comments of a module. */
    readonly scope: (file: string) => Effect.Effect<Scope, TransformError>;
    /** The imports and declarations of a declaration file. */
    readonly declarations: (
      file: string,
    ) => Effect.Effect<Declarations, TransformError>;
    /** The file a module specifier written in `file` names, `None` when it names nothing on disk. */
    readonly resolve: (
      file: string,
      specifier: string,
    ) => Option.Option<string>;
  }
>()("@local/hashql-typescript-docs/Sources") {}

// The SDK's specifiers name the emitted `.js`, while its sources and declarations end in `.ts` and `.d.ts`.
const resolver = new ResolverFactory({
  extensionAlias: { ".js": [".ts", ".d.ts", ".js"] },
});

export const layer: Layer.Layer<Sources, never, FileSystem.FileSystem> =
  Layer.effect(
    Sources,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;

      const read = Effect.fnUntraced(
        function* (file: string) {
          const text = yield* fs.readFileString(file);
          const parsed = yield* parse(text, file);

          return { ...parsed, text };
        },
        Effect.catchTag("PlatformError", TransformError.fileSystem),
      );

      const scopes = yield* Cache.make({
        capacity: Number.POSITIVE_INFINITY,
        lookup: flow(
          read,
          Effect.map(
            ({ text, program, comments }): Scope => ({
              ...collectScope(program),
              text,
              comments: Array.filter(comments, ({ type }) => type === "Block"),
            }),
          ),
        ),
      });

      const declarations = yield* Cache.make({
        capacity: Number.POSITIVE_INFINITY,
        lookup: flow(
          read,
          Effect.map(({ text, ...parsed }) =>
            collectDeclarations(text, parsed),
          ),
        ),
      });

      return Sources.of({
        scope: (file) => Cache.get(scopes, file),
        declarations: (file) => Cache.get(declarations, file),
        resolve: (file, specifier) =>
          Option.fromNullishOr(resolver.resolveFileSync(file, specifier).path),
      });
    }),
  );
