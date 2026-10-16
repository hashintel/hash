// oxlint-disable effecttsgo/unstable-api-usage -- FileSystem is unstable
import {
  Array,
  Cache,
  Context,
  Effect,
  FileSystem,
  Filter,
  Layer,
  Option,
  Record,
  String,
  pipe,
} from "effect";
import { print } from "esrap";
import ts from "esrap/languages/ts";
import { parseSync } from "oxc-parser";
import { ResolverFactory } from "oxc-resolver";

import { TransformError } from "./TransformError.js";

import type {
  BindingPattern,
  Comment,
  Declaration,
  ExportAllDeclaration,
  ExportNamedDeclaration,
  ImportDeclaration,
  ImportDeclarationSpecifier,
  ModuleExportName,
  Program,
  Statement,
  StringLiteral,
  TSQualifiedName,
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

/** The declarations of a declaration file and the statements that publish them. */
export interface Declarations {
  /** The statements declaring each top-level name, without comments. Overloads share an entry. */
  readonly local: Record.ReadonlyRecord<
    string,
    Array.NonEmptyReadonlyArray<string>
  >;
  /** For each name an export specifier publishes, that specifier as an export statement of its own. */
  readonly exports: Record.ReadonlyRecord<string, string>;
}

const parse = (
  file: string,
  text: string,
): Effect.Effect<
  Pick<ReturnType<typeof parseSync>, "program" | "comments">,
  TransformError
> => {
  const { program, comments, errors } = parseSync(file, text);

  return Array.match(errors, {
    onEmpty: () => Effect.succeed({ program, comments }),
    onNonEmpty: (failures) =>
      Effect.fail(
        TransformError.sourceSyntax(
          file,
          pipe(
            failures,
            Array.map(({ message }) => message),
          ),
        ),
      ),
  });
};

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

const isImport = (statement: Statement): statement is ImportDeclaration =>
  statement.type === "ImportDeclaration";

const isExportAll = (statement: Statement): statement is ExportAllDeclaration =>
  statement.type === "ExportAllDeclaration";

const isExportNamed = (
  statement: Statement,
): statement is ExportNamedDeclaration =>
  statement.type === "ExportNamedDeclaration";

const collectScope = (program: Program): Omit<Scope, "text" | "comments"> => {
  const exportsAll = pipe(program.body, Array.filter(isExportAll));

  return {
    imports: pipe(
      program.body,
      Array.filter(isImport),
      Array.flatMap((statement) =>
        pipe(
          statement.specifiers,
          Array.map(
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
          Option.fromNullishOr(exported).pipe(
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
        pipe(
          statement.specifiers,
          Array.map(
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
      ),
      Record.fromEntries,
    ),
  };
};

const declarationTypes: ReadonlySet<string> = new Set([
  "VariableDeclaration",
  "FunctionDeclaration",
  "TSDeclareFunction",
  "ClassDeclaration",
  "TSTypeAliasDeclaration",
  "TSInterfaceDeclaration",
  "TSEnumDeclaration",
  "TSModuleDeclaration",
] satisfies Declaration["type"][]);

const isDeclaration = (statement: Statement): statement is Declaration =>
  declarationTypes.has(statement.type);

const declarationOf = (statement: Statement): Option.Option<Declaration> => {
  if (statement.type === "ExportNamedDeclaration") {
    return Option.fromNullishOr(statement.declaration);
  }

  return Option.liftPredicate(statement, isDeclaration);
};

// Destructuring patterns and string-named modules declare no name a member can have.
const identifierName = (
  node: BindingPattern | StringLiteral | TSQualifiedName | null,
): Option.Option<string> => {
  if (node?.type === "Identifier") {
    return Option.some(node.name);
  }

  return Option.none();
};

const declaredNames = (declaration: Declaration): readonly string[] => {
  if (declaration.type === "VariableDeclaration") {
    return pipe(
      declaration.declarations,
      Array.filterMap(
        Filter.fromPredicateOption(({ id }) => identifierName(id)),
      ),
    );
  }

  return Array.fromOption(identifierName(declaration.id));
};

// A comment alone on its lines leaves with those lines, so removing it leaves no blank line behind.
const commentRange = (
  text: string,
  comment: Comment,
): { readonly start: number; readonly end: number } => {
  const lineStart = text.lastIndexOf("\n", comment.start - 1) + 1;
  const lineEnd = text.indexOf("\n", comment.end);

  if (
    lineEnd !== -1 &&
    String.isEmpty(String.trim(text.slice(lineStart, comment.start))) &&
    String.isEmpty(String.trim(text.slice(comment.end, lineEnd)))
  ) {
    return { start: lineStart, end: lineEnd + 1 };
  }

  return { start: comment.start, end: comment.end };
};

// The text between the comments inside a statement.
const statementText = (
  text: string,
  statement: Statement,
  comments: readonly Comment[],
): string => {
  const [cursor, pieces] = pipe(
    comments,
    Array.filter(
      ({ start, end }) => start >= statement.start && end <= statement.end,
    ),
    Array.map((comment) => commentRange(text, comment)),
    Array.mapAccum(statement.start, (position, range) => [
      Math.max(position, range.end),
      text.slice(position, Math.max(position, range.start)),
    ]),
  );

  return pipe([...pieces, text.slice(cursor, statement.end)], Array.join(""));
};

const collectDeclarations = (
  text: string,
  program: Program,
  comments: readonly Comment[],
): Declarations => ({
  local: pipe(
    program.body,
    Array.flatMap((statement) =>
      pipe(
        declarationOf(statement),
        Array.fromOption,
        Array.flatMap(declaredNames),
        Array.map((name) => ({
          name,
          source: statementText(text, statement, comments),
        })),
      ),
    ),
    Array.groupBy(({ name }) => name),
    Record.map(Array.map(({ source }) => source)),
  ),
  exports: pipe(
    program.body,
    Array.filter(isExportNamed),
    Array.flatMap((statement) =>
      pipe(
        statement.specifiers,
        Array.map((specifier) => {
          const single: ExportNamedDeclaration = {
            ...statement,
            specifiers: [specifier],
          };

          return [
            exportName(specifier.exported),
            print(single, ts({ quotes: "double" })).code,
          ] as const;
        }),
      ),
    ),
    Record.fromEntries,
  ),
});

/** Reads TypeScript modules with oxc, each file once per run, and resolves their specifiers. */
export class Sources extends Context.Service<
  Sources,
  {
    /** The imports, re-exports and comments of a module. */
    readonly scope: (file: string) => Effect.Effect<Scope, TransformError>;
    /** The declarations and export specifiers of a declaration file. */
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

      const read = (
        file: string,
      ): Effect.Effect<
        Pick<ReturnType<typeof parseSync>, "program" | "comments"> & {
          readonly text: string;
        },
        TransformError
      > =>
        fs.readFileString(file).pipe(
          Effect.mapError(TransformError.fileSystem),
          Effect.flatMap((text) =>
            parse(file, text).pipe(
              Effect.map((parsed) => ({ ...parsed, text })),
            ),
          ),
        );

      const scopes = yield* Cache.make({
        capacity: Number.POSITIVE_INFINITY,
        lookup: (file: string) =>
          read(file).pipe(
            Effect.map(
              ({ text, program, comments }): Scope => ({
                ...collectScope(program),
                text,
                comments: pipe(
                  comments,
                  Array.filter(({ type }) => type === "Block"),
                ),
              }),
            ),
          ),
      });

      const declarations = yield* Cache.make({
        capacity: Number.POSITIVE_INFINITY,
        lookup: (file: string) =>
          read(file).pipe(
            Effect.map(({ text, program, comments }) =>
              collectDeclarations(text, program, comments),
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
