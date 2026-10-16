/**
 * The top-level statements of a TypeScript module: which names each brings into scope, and its text without comments.
 *
 * @module
 */
import { Array, Filter, Function, Option, Order, String, pipe } from "effect";
import { Visitor } from "oxc-parser";

import type {
  BindingPattern,
  Comment,
  Declaration,
  ExportAllDeclaration,
  ExportNamedDeclaration,
  ImportDeclaration,
  Program,
  Statement,
  StringLiteral,
  TSImportEqualsDeclaration,
  TSQualifiedName,
} from "oxc-parser";

/** A module specifier in a statement's text. */
export interface Specifier {
  /** Where its string literal starts in the text, quotes included. */
  readonly start: number;
  readonly end: number;
  readonly value: string;
}

/** A top-level statement of a declaration file that brings names into its scope: an import or a declaration. */
export interface ScopeStatement {
  /** The names it binds. */
  readonly names: readonly string[];
  /** Its text without comments. */
  readonly text: string;
  /** The module specifiers its text names, in order. */
  readonly specifiers: readonly Specifier[];
}

export const isImport = (
  statement: Statement,
): statement is ImportDeclaration => statement.type === "ImportDeclaration";

const isImportEquals = (
  statement: Statement,
): statement is TSImportEqualsDeclaration =>
  statement.type === "TSImportEqualsDeclaration";

export const isExportAll = (
  statement: Statement,
): statement is ExportAllDeclaration =>
  statement.type === "ExportAllDeclaration";

export const isExportNamed = (
  statement: Statement,
): statement is ExportNamedDeclaration =>
  statement.type === "ExportNamedDeclaration";

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

export const declarationOf = (
  statement: Statement,
): Option.Option<Declaration> => {
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

export const declaredNames = (declaration: Declaration): readonly string[] => {
  if (declaration.type === "VariableDeclaration") {
    return Array.filterMap(
      declaration.declarations,
      Filter.fromPredicateOption(({ id }) => identifierName(id)),
    );
  }

  return Array.fromOption(identifierName(declaration.id));
};

// The names a statement brings into the file's scope, `None` for a statement that binds none, such as an export specifier.
export const boundNames = (
  statement: Statement,
): Option.Option<readonly string[]> => {
  if (isImport(statement)) {
    return Option.some(
      Array.map(statement.specifiers, ({ local }) => local.name),
    );
  }

  if (isImportEquals(statement)) {
    return Option.some([statement.id.name]);
  }

  return Option.map(declarationOf(statement), declaredNames);
};

// The module specifiers a statement names: its own source, and those of `import("…")` types and `require("…")` references inside it.
export const specifierLiterals = (
  program: Program,
): readonly StringLiteral[] => {
  const literals: StringLiteral[] = [];
  const collect = (literal: StringLiteral): void => {
    literals.push(literal);
  };

  new Visitor({
    ImportDeclaration: ({ source }): void => {
      collect(source);
    },
    TSImportType: ({ source }): void => {
      collect(source);
    },
    TSExternalModuleReference: ({ expression }): void => {
      collect(expression);
    },
  }).visit(program);

  return literals;
};

/** A range of a file's text that a statement's text leaves out or names as a specifier. */
interface Cut {
  readonly start: number;
  readonly end: number;
  readonly specifier: Option.Option<string>;
}

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

/** A declaration file's text and the parts of it that statements cut out or name. */
export interface File {
  readonly text: string;
  readonly comments: readonly Comment[];
  readonly literals: readonly StringLiteral[];
}

const textOf = (
  statement: Statement,
  { text, comments, literals }: File,
): Omit<ScopeStatement, "names"> => {
  const within = ({ start, end }: { start: number; end: number }): boolean =>
    start >= statement.start && end <= statement.end;
  const cuts = pipe(
    [
      ...pipe(
        comments,
        Array.filter(within),
        Array.map(
          (comment): Cut => ({
            ...commentRange(text, comment),
            specifier: Option.none(),
          }),
        ),
      ),
      ...pipe(
        literals,
        Array.filter(within),
        Array.map(
          ({ start, end, value }): Cut => ({
            start,
            end,
            specifier: Option.some(value),
          }),
        ),
      ),
    ],
    Array.sortWith((cut: Cut) => cut.start, Order.Number),
  );
  const result = Array.reduce(
    cuts,
    {
      position: statement.start,
      text: "",
      specifiers: Array.empty<Specifier>(),
    },
    ({ position, text: written, specifiers }, { start, end, specifier }) => {
      const before = `${written}${text.slice(position, Math.max(position, start))}`;

      return Option.match(specifier, {
        onNone: () => ({
          position: Math.max(position, end),
          text: before,
          specifiers,
        }),
        onSome: (value) => ({
          position: end,
          text: `${before}${text.slice(start, end)}`,
          specifiers: Array.append(specifiers, {
            start: before.length,
            end: before.length + end - start,
            value,
          }),
        }),
      });
    },
  );

  return {
    text: `${result.text}${text.slice(result.position, statement.end)}`,
    specifiers: result.specifiers,
  };
};

/** A statement's text without the comments inside it, with the offsets of its specifiers in that text. */
export const statementText: {
  (file: File): (statement: Statement) => Omit<ScopeStatement, "names">;
  (statement: Statement, file: File): Omit<ScopeStatement, "names">;
} = Function.dual(2, textOf);
