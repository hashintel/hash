import * as NodeServices from "@effect/platform-node/NodeServices";
import { Array, Context, Effect, Layer, Option, pipe } from "effect";

import * as Document from "../../src/Document.js";
import * as DocumentationParser from "../../src/DocumentationParser.js";
import * as Location from "../../src/Location.js";
import * as Page from "../../src/Page.js";
import * as Parser from "../../src/Parser.js";
import * as Api from "../../src/TypeScript/Api.js";
import * as Compiler from "./compiler.js";
import * as ParserFixture from "./parser.js";

/** The fixture module's page as Markdown, with its declarations located nowhere. The compiler stops once the page has its Markdown. */
export const markdown = Effect.fnUntraced(function* (
  options: Compiler.Options,
) {
  // The parse reads paths through the Node services, and the printer runs on the API.
  const services = yield* Layer.build(
    Layer.mergeAll(
      Compiler.layer(options),
      Layer.succeed(
        DocumentationParser.DocumentationParser,
        DocumentationParser.make(ParserFixture.configuration()),
      ),
      Layer.succeed(
        Location.Locations,
        Location.Locations.of({ locate: () => Effect.succeedNone }),
      ),
      Api.layer,
      NodeServices.layer,
    ),
  );
  const { source } = Context.get(services, Compiler.Fixture);

  return yield* Effect.gen(function* () {
    const catalogue = yield* Parser.parse([["fixture", source]]);
    const document = yield* Effect.fromResult(Document.collect(catalogue));
    const { pages } = yield* Page.all(document, {
      sourceUrl: ({ file, line }) => `${file}#L${line}`,
    });
    const page = pipe(
      pages,
      Array.findFirst(({ tree }) => tree.type === "module"),
      Option.getOrThrow,
    );

    return yield* Effect.fromResult(Page.toMarkdown(page));
  }).pipe(Effect.provide(services));
}, Effect.scoped);
