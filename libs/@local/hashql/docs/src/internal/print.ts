import { Array, Effect, Option, Order, Result, pipe } from "effect";

import * as Code from "../Code.js";
import * as Location from "../Location.js";
import * as QuickInfo from "../QuickInfo.js";
import * as Tree from "../Tree/index.js";
import * as TypeScript from "../TypeScript/index.js";
import * as References from "./references.js";
import * as Syntax from "./signature-syntax.js";

import type * as AST from "../AST/index.js";
import type { Declaration, Node, SourceFile } from "typescript/ast";

/** Syntax a page prints: a declaration's nodes, or the one type of a parameter or a result. */
export type Printable = readonly Node[] | Node;

/** A term line: a type as printed, in the overloads of every form whose type prints as it. */
export interface Term {
  readonly source: Code.Source;
  readonly applies: Tree.Callable.Applies;
}

/** The code of a page's tree as text, looked up by the syntax or the example program it was printed from, and where each declaration it documents is in its source. */
export interface Printed {
  readonly signature: (
    syntax: Printable,
  ) => Result.Result<Code.Source, Code.CodeError>;
  /** The term lines of `forms`, in the order their types first appear. Forms whose types print alike, such as two that differ only inside a hidden list of type arguments, share a line. */
  readonly terms: <Origin>(
    forms: readonly Tree.Callable.Form<Origin>[],
  ) => Result.Result<readonly Term[], Code.CodeError>;
  readonly example: (
    program: SourceFile,
  ) => Result.Result<Code.Source, Code.CodeError>;
  /** Where `node` is declared, or none for a node without a declaration map. */
  readonly location: (node: Node) => Option.Option<Location.Location>;
}

/** How many characters of a type a term line shows before the type's deepest lists of type arguments give way to `…`. */
const width = 60;

interface Found {
  readonly syntax: Printable[];
  /** The types of parameters and results, which a page shows on a term line. */
  readonly types: Node[];
  readonly programs: SourceFile[];
  readonly declarations: (Declaration | SourceFile)[];
}

const comment = (found: Found, value: Tree.Comment.Comment): void => {
  for (const { program } of value.examples) {
    found.programs.push(...Option.toArray(program));
  }
};

const signatures = (
  found: Found,
  value: Option.Option<Tree.Declaration.Signatures>,
): void => {
  for (const { children } of Option.toArray(value)) {
    found.syntax.push(...Array.map(children, ({ syntax }) => syntax));
    found.declarations.push(
      ...Array.map(children, ({ origin }) => origin.node),
    );
  }
};

const callable = (found: Found, value: Tree.Callable.Callable): void => {
  for (const { forms } of value.parameters) {
    found.types.push(...Array.map(forms, ({ type }) => type));
  }
  for (const { forms } of Option.toArray(value.returns)) {
    found.types.push(...Array.map(forms, ({ type }) => type));
  }
};

const member = (found: Found, value: Tree.Member.Member): void => {
  for (const each of value.comments) {
    comment(found, each);
  }
  if (value.type === "accessor") {
    for (const half of Array.appendAll(
      Option.toArray(value.get),
      Option.toArray(value.set),
    )) {
      found.syntax.push(half.syntax);
      found.declarations.push(half.origin.node);
    }
    return;
  }

  signatures(found, Option.some(value.signatures));
  if (value.type === "method") {
    callable(found, value);
  }
};

const exported = (found: Found, value: Tree.Export.Export): void => {
  signatures(found, value.signatures);
  callable(found, value);
  for (const each of value.comments) {
    comment(found, each);
  }
  for (const each of value.members) {
    member(found, each);
  }
  for (const namespace of Option.toArray(value.namespace)) {
    found.declarations.push(namespace.origin.node);
    for (const each of Option.toArray(namespace.comment)) {
      comment(found, each);
    }
    for (const each of namespace.exports) {
      exported(found, each);
    }
  }
};

const page = (found: Found, value: Tree.Page.Page): void => {
  if (value.type === "module") {
    found.declarations.push(value.namespace.node);
    for (const each of Option.toArray(value.comment)) {
      comment(found, each);
    }
    for (const group of value.groups) {
      for (const each of group.exports) {
        exported(found, each);
      }
    }
  } else if (value.type === "traits") {
    for (const { description } of value.traits) {
      if (description.type === "comment") {
        comment(found, description);
      }
    }
  }
};

const nodesOf = (syntax: Printable): readonly Node[] => {
  if ("kind" in syntax) {
    return [syntax];
  }

  return syntax;
};

/** The printed code of `key`. A tree printed here has every code, so a lookup of other syntax is the caller's defect, reported rather than thrown. */
const lookup =
  <Key extends Printable | SourceFile>(table: WeakMap<Key, Code.Source>) =>
  (key: Key): Result.Result<Code.Source, Code.CodeError> =>
    Result.fromOption(Option.fromUndefinedOr(table.get(key)), () =>
      Code.CodeError.make({ reason: { _tag: "MissingSignature" } }),
    );

/** `terms` with those that print the same text joined into the first of them. */
const joined = (terms: readonly Term[]): readonly Term[] =>
  pipe(
    terms,
    Array.dedupeWith((self, that) => self.source.text === that.source.text),
    Array.map(({ source, applies }): Term => {
      const alike = pipe(
        terms,
        Array.filter((term) => term.source.text === source.text),
        Array.flatMap((term) => term.applies.overloads),
      );

      return {
        source,
        applies: Tree.Callable.applies({
          overloads: pipe(
            applies.overloads,
            Array.appendAll(alike),
            Array.sortBy(Order.Number),
          ),
          total: applies.total,
        }),
      };
    }),
  );

const termsOf =
  (signature: Printed["signature"]): Printed["terms"] =>
  (forms) =>
    pipe(
      forms,
      Array.map(({ type, applies }) =>
        Result.map(signature(type), (source): Term => ({ source, applies })),
      ),
      Result.all,
      Result.map(joined),
    );

/** An example's code as written, with each name `ast` resolves as a link that shows the name's quick info. */
const example = Effect.fnUntraced(function* (
  program: SourceFile,
  ast: AST.Store["Service"],
) {
  const names = Array.flatMap(TypeScript.Node.identifiers(program), (name) =>
    Array.map(
      Option.toArray(ast.nameOf(name)),
      (resolved) => [name, resolved] as const,
    ),
  );
  const quickInfo = yield* Effect.forEach(
    names,
    ([name, { quickInfo: info }]) =>
      Option.match(info, {
        onNone: () => Effect.succeedNone,
        onSome: (value) =>
          QuickInfo.display(value, name).pipe(
            Effect.map((text) =>
              Option.some({
                offset: name.getStart(),
                length: name.getWidth(),
                text,
              }),
            ),
          ),
      }),
  );

  return yield* Effect.fromResult(
    Code.prepare({
      text: program.text,
      links: Array.map(names, ([name, { target }]) =>
        Code.linkOf(name, ast.idOf(target)),
      ),
      quickInfo: Array.getSomes(quickInfo),
    }),
  );
});

/** `type` whole when it fits on a term line, or else with its deepest lists of type arguments hidden, one level at a time, until it fits or it has hidden its outermost lists. */
const fitted = Effect.fnUntraced(function* (
  type: Node,
  names: References.Names,
) {
  const whole = yield* Code.print([type], names);
  const deepest = Syntax.deepest([type]);
  if (whole.text.length <= width || Option.isNone(deepest)) {
    return whole;
  }

  let candidate = whole;
  for (const depth of Array.reverse(Array.range(0, deepest.value))) {
    candidate = yield* Code.print(Syntax.elide([type], depth), names);
    if (candidate.text.length <= width) {
      break;
    }
  }

  return candidate;
});

/** Prints every signature, type and example of `pages` once, after the trees are complete and before any adapter writes them. */
export const pages = Effect.fnUntraced(function* (
  values: readonly Tree.Page.Page[],
  ast: AST.Store["Service"],
) {
  const found: Found = {
    syntax: [],
    types: [],
    programs: [],
    declarations: [],
  };
  for (const value of values) {
    page(found, value);
  }

  const names = References.linksOf(ast);
  const printed = new WeakMap<Printable, Code.Source>();
  for (const syntax of found.syntax) {
    if (!printed.has(syntax)) {
      printed.set(syntax, yield* Code.print(nodesOf(syntax), names));
    }
  }
  for (const type of found.types) {
    if (!printed.has(type)) {
      printed.set(type, yield* fitted(type, names));
    }
  }

  const examples = new WeakMap<SourceFile, Code.Source>();
  for (const program of found.programs) {
    if (!examples.has(program)) {
      examples.set(program, yield* example(program, ast));
    }
  }

  const locations = yield* Location.Locations;
  const located = new WeakMap<Node, Location.Location>();
  for (const declaration of found.declarations) {
    if (!located.has(declaration)) {
      for (const location of Option.toArray(
        yield* locations.locate(declaration),
      )) {
        located.set(declaration, location);
      }
    }
  }

  const signature = lookup(printed);
  return {
    signature,
    terms: termsOf(signature),
    example: lookup(examples),
    location: (node): Option.Option<Location.Location> =>
      Option.fromUndefinedOr(located.get(node)),
  } satisfies Printed;
});
