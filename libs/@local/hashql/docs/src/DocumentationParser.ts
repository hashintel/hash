import { TSDocConfiguration, TSDocParser } from "@microsoft/tsdoc";
import { TSDocConfigFile } from "@microsoft/tsdoc-config";
import { Context, Effect } from "effect";

import * as DocumentationError from "./DocumentationError.js";
import * as DocParse from "./internal/doc-parse.js";

import type * as AST from "./AST/index.js";
import type { JSDoc } from "typescript/ast";

/**
 * Parses comments with one package's TSDoc configuration.
 *
 * A comment TSDoc reports any diagnostic for, or whose examples or metadata this reference rejects, fails as a whole instead of parsing partially.
 */
export class DocumentationParser extends Context.Service<
  DocumentationParser,
  {
    readonly parse: (
      comment: JSDoc,
    ) => Effect.Effect<
      AST.Documentation.Documentation,
      DocumentationError.DocumentationError
    >;
  }
>()("@local/hashql-docs/DocumentationParser") {}

/** A parser over an in-memory configuration. */
export const make = (
  configuration: TSDocConfiguration,
): DocumentationParser["Service"] => {
  const parse = DocParse.parse(new TSDocParser(configuration));

  return DocumentationParser.of({
    parse: (comment) => Effect.suspend(() => Effect.fromResult(parse(comment))),
  });
};

/** Loads a package configuration, including the configurations it extends. */
export const fromFile = Effect.fnUntraced(function* (
  file: string,
): Effect.fn.Return<
  DocumentationParser["Service"],
  DocumentationError.DocumentationError
> {
  const config = yield* Effect.sync(() => TSDocConfigFile.loadFile(file));

  if (config.hasErrors) {
    return yield* DocumentationError.DocumentationError.make({
      file,
      reason: {
        _tag: "InvalidConfiguration",
        file,
        summary: config.getErrorSummary(),
      },
    });
  }

  const configuration = new TSDocConfiguration();
  config.configureParser(configuration);

  return make(configuration);
});
