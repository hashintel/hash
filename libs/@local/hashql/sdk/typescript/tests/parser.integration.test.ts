import { NodeServices } from "@effect/platform-node";
import { expect, layer } from "@effect/vitest";
import { Arbitrary, Effect, Option, Stream, pipe } from "effect";
import { ChildProcess } from "effect/process";

import { typeSyntax } from "../src/internal/type-parser.js";
import * as Ident from "../src/JExpr/Ident.js";
import * as JExpr from "../src/JExpr/index.js";
import * as Path from "../src/JExpr/Path.js";
import * as Type from "../src/JExpr/Type/index.js";

// Package scripts run from the SDK directory. Turbo builds the CLI before this suite.
const parser = "../../../../../target/debug/parse";

const parse = Effect.fnUntraced(
  function* (source: string) {
    const child = yield* ChildProcess.make(parser, ["--no-output"], {
      stdin: pipe(Stream.make(source), Stream.encodeText),
      stdout: "ignore",
      stderr: "pipe",
    });

    return yield* Effect.all(
      {
        status: child.exitCode,
        diagnostics: pipe(child.stderr, Stream.decodeText(), Stream.mkString),
      },
      { concurrency: "unbounded" },
    );
  },
  // Close each child's resources after its case, rather than retaining them through shrinking.
  Effect.scoped,
  Effect.timeout("5 seconds"),
);

const options = {
  arbitrary: { runs: 100, size: 100, seed: 42, maxShrinks: 1000 },
  timeout: 60_000,
};

layer(NodeServices.layer, { excludeTestServices: true })(
  "rust_parser",
  (it) => {
    it.effect(
      "cli_controls",
      Effect.fnUntraced(function* () {
        expect.hasAssertions();

        const valid = yield* parse(JExpr.compile("Item"));
        // oxlint-disable-next-line vitest/valid-expect -- Vitest accepts a second argument for the Rust diagnostic message.
        expect(valid.status, valid.diagnostics).toBe(0);
        const invalid = yield* parse(JExpr.compile("bad::"));
        // oxlint-disable-next-line vitest/valid-expect -- Vitest accepts a second argument for the Rust diagnostic message.
        expect(invalid.status, invalid.diagnostics).toBe(1);
      }),
    );

    it.effect.prop(
      "identifier",
      {
        source: pipe(
          Ident.arbitrary(),
          Arbitrary.map(({ output }) =>
            pipe(output, Ident.compile, JExpr.compile),
          ),
        ),
      },
      Effect.fnUntraced(function* ({ source }) {
        expect.hasAssertions();

        const result = yield* parse(source);
        // oxlint-disable-next-line vitest/valid-expect -- Vitest accepts a second argument for the Rust diagnostic message.
        expect(result.status, result.diagnostics).toBe(0);
      }),
      options,
    );

    it.effect.prop(
      "path",
      {
        source: pipe(
          Path.arbitrary(),
          Arbitrary.map(({ output }) =>
            pipe(output, Path.compile, JExpr.compile),
          ),
        ),
      },
      Effect.fnUntraced(function* ({ source }) {
        expect.hasAssertions();

        const result = yield* parse(source);
        // oxlint-disable-next-line vitest/valid-expect -- Vitest accepts a second argument for the Rust diagnostic message.
        expect(result.status, result.diagnostics).toBe(0);
      }),
      options,
    );

    it.effect.prop(
      "rooted_tuple",
      {
        source: pipe(
          Ident.arbitrary(),
          Arbitrary.map(({ output }) => {
            const member = pipe(
              `::${Ident.compile(output)}`,
              Type.reference,
              Option.getOrThrow,
            );

            return pipe(
              JExpr.literal(null),
              JExpr.typed(Type.tuple(member)),
              JExpr.compile,
            );
          }),
        ),
      },
      Effect.fnUntraced(function* ({ source }) {
        expect.hasAssertions();

        const result = yield* parse(source);
        // oxlint-disable-next-line vitest/valid-expect -- Vitest accepts a second argument for the Rust diagnostic message.
        expect(result.status, result.diagnostics).toBe(0);
      }),
      options,
    );

    it.effect.prop(
      "type_annotation",
      {
        source: pipe(
          typeSyntax.arbitrary(),
          Arbitrary.map(({ output }) =>
            pipe(JExpr.literal(null), JExpr.typed(output), JExpr.compile),
          ),
        ),
      },
      Effect.fnUntraced(function* ({ source }) {
        expect.hasAssertions();

        const result = yield* parse(source);
        // oxlint-disable-next-line vitest/valid-expect -- Vitest accepts a second argument for the Rust diagnostic message.
        expect(result.status, result.diagnostics).toBe(0);
      }),
      options,
    );
  },
);
