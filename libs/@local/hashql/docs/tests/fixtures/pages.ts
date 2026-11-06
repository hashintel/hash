import * as NodeServices from "@effect/platform-node/NodeServices";
import { Array, Effect, Layer, Option, pipe } from "effect";

import * as Document from "../../src/Document.js";
import * as Location from "../../src/Location.js";
import * as Page from "../../src/Page.js";
import * as Parser from "../../src/Parser.js";
import * as Api from "../../src/TypeScript/Api.js";
import * as Compiler from "./compiler.js";
import * as ParserFixture from "./parser.js";

/** The fixture module's page as Markdown, with its declarations located nowhere. */
export const markdown = async (options: Compiler.Options): Promise<string> => {
  const fixture = await Compiler.open(options);
  try {
    return await Effect.gen(function* () {
      const catalogue = yield* Parser.parse([["fixture", fixture.source]]);
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
    }).pipe(
      Effect.scoped,
      Effect.provideService(Location.Locations, {
        locate: () => Effect.succeedNone,
      }),
      Effect.provide(ParserFixture.services(fixture)),
      // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This fixture entry point owns the printer and filesystem services until it writes the page.
      Effect.provide(Layer.merge(Api.layer, NodeServices.layer)),
      Effect.runPromise,
    );
  } finally {
    await fixture.api.close();
  }
};
