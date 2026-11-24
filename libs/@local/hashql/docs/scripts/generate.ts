import process from "node:process";
import { fileURLToPath } from "node:url";

import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { Effect, HashMap, Layer, Option } from "effect";

// uses dist to allow for generation through node instead of tsx
import * as Generation from "../dist/Generation.js";
import * as Page from "../dist/Page.js";
import * as TypeScript from "../dist/TypeScript/index.js";

import type * as Catalogue from "../dist/Catalogue.js";

const spelling = (name: Catalogue.Name): string =>
  `${name.entrypoint} ${name.path.join(".")}`;

const main = Effect.gen(function* () {
  const result = yield* Generation.fromDirectory({
    directory: fileURLToPath(new URL("../.generated", import.meta.url)),
    sourceUrl: ({ file, line }) => `${file}#L${line}`,
  });

  for (const [name, id] of result.catalogue.byName) {
    const { name: canonical } = HashMap.get(result.catalogue.byId, id).pipe(
      Option.getOrThrow,
    );
    process.stdout.write(`${spelling(name)} -> ${spelling(canonical)}\n`);
  }

  for (const page of result.pages) {
    const markdown = yield* Effect.fromResult(Page.toMarkdown(page));
    process.stdout.write(`\n=== ${page.file}\n${markdown}`);
  }
});

// oxlint-disable-next-line vitest/require-hook -- This command starts a runtime rather than registering test setup.
NodeRuntime.runMain(
  main.pipe(
    // oxlint-disable-next-line effecttsgo/strict-effect-provide -- This script owns the compiler and filesystem services.
    Effect.provide(Layer.merge(TypeScript.Api.layer, NodeServices.layer)),
  ),
);
