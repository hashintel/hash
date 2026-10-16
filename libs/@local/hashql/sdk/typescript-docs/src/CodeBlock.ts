/**
 * The code blocks that show a member's signature.
 *
 * Twoslash compiles each block whole, so the declarations its hovers need sit above a cut, and the page shows only the statements below it. The block's meta lists, for each name the statements refer to and in their order, the URL that documents it. The docs site formats the code before it highlights it, so it finds the names again in the formatted code and pairs them with that list.
 *
 * @module
 */
import { Array, Effect, Filter, Function, Option, Schema, pipe } from "effect";
import { parseCodeBlockAttributes } from "fumadocs-core/mdx-plugins/codeblock-utils";

import * as References from "./References.js";
import { parse } from "./Sources.js";
import { TransformError } from "./TransformError.js";

/** A span of the shown code that names a documented declaration, and the URL that documents it. */
export interface Link {
  readonly start: number;
  readonly end: number;
  readonly url: string;
}

// `null` stands for a name that nothing on the site documents.
const Urls = Schema.fromJsonString(
  Schema.Array(Schema.OptionFromNullOr(Schema.String)),
);

const attribute = "links";

/** The line above which Twoslash compiles a block without showing it. */
export const cut = "// ---cut---";

// Percent-encoding leaves the JSON without the quotes and spaces that would end the attribute.
/** A signature block's meta: Twoslash's trigger and, for each name the code refers to, its URL. */
export const meta = (
  urls: readonly Option.Option<string>[],
): Effect.Effect<string, Schema.SchemaError> =>
  pipe(
    urls,
    Schema.encodeEffect(Urls),
    Effect.map(
      (encoded) => `twoslash ${attribute}="${encodeURIComponent(encoded)}"`,
    ),
  );

/** The URLs a code block's meta carries, `None` for a block that is not a signature. */
export const urls = (
  blockMeta: string,
): Effect.Effect<
  Option.Option<readonly Option.Option<string>[]>,
  TransformError
> =>
  pipe(
    parseCodeBlockAttributes(blockMeta, [attribute]).attributes[attribute],
    Option.fromUndefinedOr,
    Option.match({
      onNone: () => Effect.succeedNone,
      onSome: (value) =>
        pipe(
          value,
          Schema.decodeUnknownEffect(Schema.String),
          Effect.flatMap((encoded) =>
            Effect.try(() => decodeURIComponent(encoded)),
          ),
          Effect.flatMap(Schema.decodeEffect(Urls)),
          Effect.mapError(TransformError.unreadableCodeBlock),
          Effect.asSome,
        ),
    }),
  );

const placeIn = (
  code: string,
  blockMeta: string,
): Effect.Effect<readonly Link[], TransformError> =>
  pipe(
    blockMeta,
    urls,
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.succeed([]),
        onSome: (listed) =>
          pipe(
            code,
            parse("signature.d.ts"),
            Effect.map(({ program }) => References.of(program)),
            Effect.filterOrFail(
              (references) => references.length === listed.length,
              (references) =>
                TransformError.misalignedCodeBlock(
                  references.length,
                  listed.length,
                ),
            ),
            Effect.map((references) =>
              Array.filterMap(
                Array.zip(references, listed),
                Filter.fromPredicateOption(([{ start, end }, url]) =>
                  Option.map(
                    url,
                    (found): Link => ({ start, end, url: found }),
                  ),
                ),
              ),
            ),
          ),
      }),
    ),
  );

/** Pairs a signature block's URLs, from its meta, with the names its shown code refers to, and keeps the names that have one. */
export const place: {
  (
    blockMeta: string,
  ): (code: string) => Effect.Effect<readonly Link[], TransformError>;
  (
    code: string,
    blockMeta: string,
  ): Effect.Effect<readonly Link[], TransformError>;
} = Function.dual(2, placeIn);
