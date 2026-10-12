/**
 * The README names the AI SDK and Flue versions the upstream cases were
 * derived from. A dependency bump fails here until someone re-derives the
 * cases and moves the README's baseline, so a green bump cannot merge with a
 * stale baseline.
 */
import { readFileSync } from "node:fs";

import { expect, test } from "vitest";

const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const manifest = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { readonly dependencies?: Readonly<Record<string, string>> };

const baseline =
  /The transport targets `ai@(?<ai>[^`]+)` and `@flue\/sdk`\/`@flue\/runtime` `(?<flue>[^`]+)`\./.exec(
    readme,
  )?.groups;

test("the README states the dependency baseline", () => {
  expect(baseline).toBeDefined();
});

test("the pinned AI SDK and Flue versions match the README baseline", () => {
  expect({
    ai: manifest.dependencies?.ai,
    "@flue/sdk": manifest.dependencies?.["@flue/sdk"],
    "@flue/runtime": manifest.dependencies?.["@flue/runtime"],
  }).toEqual({
    ai: baseline?.ai,
    "@flue/sdk": baseline?.flue,
    "@flue/runtime": baseline?.flue,
  });
});
