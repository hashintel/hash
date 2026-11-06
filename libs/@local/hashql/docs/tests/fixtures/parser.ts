import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  TSDocConfiguration,
  TSDocTagDefinition,
  TSDocTagSyntaxKind,
} from "@microsoft/tsdoc";
import { Context, Effect, Layer, flow } from "effect";

import * as DocumentationParser from "../../src/DocumentationParser.js";
import * as Parser from "../../src/Parser.js";
import * as Compiler from "./compiler.js";

import type * as AST from "../../src/AST/index.js";

/** The tags and elements the package's own TSDoc configuration defines. */
export const configuration = (): TSDocConfiguration => {
  const value = new TSDocConfiguration();
  for (const tagName of ["@since", "@category", "@stability"]) {
    value.addTagDefinition(
      new TSDocTagDefinition({
        tagName,
        syntaxKind: TSDocTagSyntaxKind.BlockTag,
      }),
    );
  }
  for (const tagName of ["@module", "@trait"]) {
    value.addTagDefinition(
      new TSDocTagDefinition({
        tagName,
        syntaxKind: TSDocTagSyntaxKind.ModifierTag,
      }),
    );
  }
  value.setSupportedHtmlElements(["caption", "code"]);
  return value;
};

/** The fixture parsed into a store, or the failure that stopped the parse. The compiler stops when the parse finishes. */
export const parse = Effect.fnUntraced(function* (options: Compiler.Options) {
  // The parse reads paths through the Node services.
  const services = yield* Layer.build(
    Layer.mergeAll(
      Compiler.layer(options),
      Layer.succeed(
        DocumentationParser.DocumentationParser,
        DocumentationParser.make(configuration()),
      ),
      NodeServices.layer,
    ),
  );
  const { source } = Context.get(services, Compiler.Fixture);
  return yield* Parser.parse([["fixture", source]]).pipe(
    Effect.map(({ ast }): AST.Store["Service"] => ast),
    Effect.result,
    Effect.provide(services),
  );
}, Effect.scoped);

/** The fixture parsed into a store. */
export const success = flow(parse, Effect.flatMap(Effect.fromResult));
