import { describe, expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";

import * as CodeBlock from "./CodeBlock.js";

const urls: readonly Option.Option<string>[] = [
  Option.some("/docs/reference/type/Type"),
  Option.some('/docs/reference/type/Type#"quoted" and spaced'),
  Option.none(),
];

describe("code_block", () => {
  it.effect("urls_round_trip", () =>
    Effect.gen(function* () {
      const meta = yield* CodeBlock.meta(urls);

      expect(yield* CodeBlock.urls(meta)).toStrictEqual(Option.some(urls));
    }),
  );

  // Fumadocs removes the attributes it knows and hands the rest to transformers.
  it.effect("urls_beside_other_attributes", () =>
    Effect.gen(function* () {
      const meta = yield* CodeBlock.meta(urls);

      expect(
        yield* CodeBlock.urls(`title="Example" ${meta} lineNumbers`),
      ).toStrictEqual(Option.some(urls));
    }),
  );

  it.effect("urls_absent", () =>
    Effect.gen(function* () {
      expect(yield* CodeBlock.urls('twoslash title="Example"')).toStrictEqual(
        Option.none(),
      );
    }),
  );

  it.effect("urls_malformed", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(CodeBlock.urls('links="%5B%7B%7D%5D"'));

      expect(error.reason._tag).toBe("UnreadableCodeBlock");
    }),
  );

  // The formatter re-indents and wraps the code, and the names keep their order.
  it.effect("place_after_formatting", () =>
    Effect.gen(function* () {
      const meta = yield* CodeBlock.meta(urls);
      const code = ["declare const value: Type.Any<", "  Missing", ">;"].join(
        "\n",
      );

      expect(
        Array.from(
          yield* CodeBlock.place(code, meta),
          ({ start, end, url }) => [code.slice(start, end), url],
        ),
      ).toStrictEqual([
        ["Type", "/docs/reference/type/Type"],
        ["Any", '/docs/reference/type/Type#"quoted" and spaced'],
      ]);
    }),
  );

  it.effect("place_misaligned", () =>
    Effect.gen(function* () {
      const meta = yield* CodeBlock.meta(urls);
      const error = yield* Effect.flip(
        CodeBlock.place("declare const value: Type;", meta),
      );

      expect(error.reason).toMatchObject({
        _tag: "MisalignedCodeBlock",
        references: 1,
        links: 3,
      });
    }),
  );
});
