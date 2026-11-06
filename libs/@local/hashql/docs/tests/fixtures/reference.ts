import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  Array,
  Effect,
  Function,
  HashMap,
  Layer,
  Option,
  Path,
  Result,
} from "effect";

import * as Catalogue from "../../src/Catalogue.js";
import * as Document from "../../src/Document.js";
import * as DocumentationLinks from "../../src/DocumentationLinks.js";
import * as DocumentationParser from "../../src/DocumentationParser.js";
import * as Parser from "../../src/Parser.js";
import * as TypeScript from "../../src/TypeScript/index.js";

/** Declarations that exercise every part of a page: overloads, call comments, merged types and values, members, a merged namespace, an alias and a cycle. */
export const source = `/** Module with \`code\` and {@link Value}. @module */
/** A value. More detail. */ export interface Value { readonly text: string; }
/** First call.
 * @param input - First input.
 * @deprecated Use the other form.
 * @since 1.0.0
 * @example
 * \`\`\`ts
 * import { choose } from "@scope/pkg";
 * choose({ text: "first" });
 * \`\`\`
 */
export function choose(input: Value): Value;
/** Second call. @param input - Second input. @returns A list. */
export function choose(input: readonly Value[]): readonly Value[];
/** Container docs. */
export const callable: {
  /** Inner call. @param input - Inner input. */ (input: Value): Value;
  (input: number): number;
  readonly flag: true;
};
/** Type side. */ export type Pair = Value;
/** Value side. */ export const Pair: number;
/** Documented. */ export function partial(input: Value): void;
export function partial(input: string): void;
/** Both deprecated. @deprecated No replacement. */ export function old(input: number): void;
/** Also deprecated. @deprecated No replacement. */ export function old(input: string): void;
/** Model. */ export class Model {
  /** Static make. */ static make(): Model;
  /** Instance make. */ make(): Model;
  /** Getter. */ get value(): Value;
  /** Setter. */ set value(input: Value);
}
/** Namespace with {@link Value}. */ export namespace Model {
  export const child: Value;
  export { Value as Alias };
  export namespace Helpers { export const nested: boolean; }
}
export { choose as again };
export * as Cycle from "./index.js";
`;

export interface Options {
  /** The declarations of `@scope/pkg`, in `index.d.ts`. */
  readonly source: string;
  /** The declarations of `@scope/pkg/Other`, in `other.d.ts`. */
  readonly other?: string;
  /** More declaration files the entrypoints import, by name. */
  readonly files?: Readonly<Record<string, string>>;
  /** The TSDoc configuration, by its file name below the fixtures, or the SDK's when absent. */
  readonly configuration?: string;
}

export interface Reference {
  readonly document: Document.Document;
}

/** Builds the reference for `options` as the generation builds a directory's. */
const build = Effect.fnUntraced(
  function* (options: Options) {
    const path = yield* Path.Path;
    // The files exist only in memory, below the package, so an import of `effect` resolves to the package's own dependency.
    const directory = yield* path.fromFileUrl(
      new URL("reference", import.meta.url),
    );
    const configuration = yield* path.fromFileUrl(
      new URL("../../../sdk/typescript/tsdoc.json", import.meta.url),
    );
    const index = path.join(directory, "index.d.ts");
    const roots: (readonly [string, string])[] = [["@scope/pkg", index]];
    let files = HashMap.make([index, options.source]);

    if (options.other !== undefined) {
      const other = path.join(directory, "other.d.ts");
      roots.push(["@scope/pkg/Other", other]);
      files = HashMap.set(files, other, options.other);
    }

    for (const [name, contents] of Object.entries(options.files ?? {})) {
      files = HashMap.set(files, path.join(directory, name), contents);
    }

    const program = TypeScript.Program.layer(
      Array.map(roots, ([, file]) => file),
      {
        paths: Object.fromEntries(
          Array.map(roots, ([name, file]) => [name, [file]] as const),
        ),
        files,
      },
    );

    return yield* Effect.gen(function* () {
      const compiler = yield* TypeScript.Program.Program;
      const modules = yield* Effect.forEach(
        roots,
        Effect.fnUntraced(function* ([name, file]) {
          const source = yield* compiler.sourceFile(file);

          return [
            name,
            Option.getOrThrow(
              Option.filter(source, TypeScript.Module.isModule),
            ),
          ] as const;
        }),
      );
      const catalogue = yield* Parser.parse(modules);
      yield* Effect.fromResult(DocumentationLinks.check(catalogue));
      const document = yield* Effect.fromResult(Document.collect(catalogue));

      return { document };
    }).pipe(
      Effect.scoped,
      Effect.provideServiceEffect(
        DocumentationParser.DocumentationParser,
        DocumentationParser.fromFile(
          Option.match(Option.fromUndefinedOr(options.configuration), {
            onNone: () => configuration,
            onSome: (name) => path.join(path.dirname(directory), name),
          }),
        ),
      ),
      // oxlint-disable-next-line effecttsgo/strict-effect-provide -- The program serves this reference alone, and closes once its document is complete.
      Effect.provide(program),
    );
  },
  // oxlint-disable-next-line effecttsgo/strict-effect-provide -- The fixture owns the compiler process and the filesystem for one reference.
  Effect.provide(Layer.merge(TypeScript.Api.layer, NodeServices.layer)),
);

/** What building a reference fails on. */
export type Failure = Effect.Error<ReturnType<typeof build>>;

/** The reference for `options`, collected as the generation collects a directory's, or the failure that stopped it. */
export const run = async (
  options: Options,
): Promise<Result.Result<Reference, Failure>> =>
  build(options).pipe(Effect.result, Effect.runPromise);

/** The reference for `options`, which must build. */
export const success = async (options: Options): Promise<Reference> =>
  Result.getOrThrow(await run(options));

/** The identity of the export at `path` below `@scope/pkg`. */
export const id: {
  (path: readonly string[]): (reference: Reference) => Catalogue.DeclarationId;
  (reference: Reference, path: readonly string[]): Catalogue.DeclarationId;
} = Function.dual(
  2,
  (reference: Reference, path: readonly string[]): Catalogue.DeclarationId =>
    Catalogue.lookup(reference.document.catalogue, {
      entrypoint: "@scope/pkg",
      path,
    }).pipe(Option.getOrThrow, (entry) => entry.id),
);
