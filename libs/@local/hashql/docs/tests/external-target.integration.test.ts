import { describe, expect, layer } from "@effect/vitest";
import { Array, Effect, Option, pipe } from "effect";

import * as ExternalTarget from "../src/ExternalTarget.js";
import * as TypeScript from "../src/TypeScript/index.js";
import * as Compiler from "./fixtures/compiler.js";

const library = `interface String { trim(): string }
declare var String: { new (): String };
interface Array<T> { readonly length: number }
declare var Array: { new (): Array<unknown> };
interface ReadonlyArray<T> { readonly length: number }
interface Iterable<T> { next(): T }
type PropertyKey = string;
type Pick<T, K extends keyof T> = { [P in K]: T[P] };`;

const source = `/// <reference path="./lib/lib.es5.d.ts" />
declare const text: String;
export type Text = String;
export type Trim = typeof text.trim;
export type List = ReadonlyArray<string>;
export type Items = Iterable<string>;
export type Key = PropertyKey;
export type Picked = Pick<{ a: 1 }, "a">;`;

const mdn =
  "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects";

layer(Compiler.layer({ source, files: { "lib/lib.es5.d.ts": library } }), {
  excludeTestServices: true,
})("external target", (it) => {
  /** The page for the last name spelled `text` in the fixture, read as a type. */
  const page = Effect.fnUntraced(function* (text: string) {
    const fixture = yield* Compiler.Fixture;
    const checker = yield* TypeScript.Checker.Checker;
    const name = pipe(
      TypeScript.Node.identifiers(fixture.source),
      Array.findLast((identifier) => identifier.text === text),
      Option.getOrThrow,
    );
    const symbol = pipe(
      yield* checker.getSymbolAtLocation([name]),
      Array.head,
      Option.flatten,
      Option.getOrThrow,
    );
    const pages = yield* ExternalTarget.pages(symbol);

    return Option.map(pages.type, (url) => url.href);
  });

  describe("library pages", () => {
    it.effect.each([
      ["String", `${mdn}/String`],
      ["ReadonlyArray", `${mdn}/Array`],
      [
        "Pick",
        "https://www.typescriptlang.org/docs/handbook/utility-types.html#picktype-keys",
      ],
    ] as const)(
      "documented_%#",
      Effect.fnUntraced(function* ([name, href]: readonly [string, string]) {
        expect.hasAssertions();
        expect(yield* page(name)).toStrictEqual(Option.some(href));
      }),
    );

    it.effect.each(["trim", "Iterable", "PropertyKey"])(
      "undocumented_%#",
      Effect.fnUntraced(function* (name: string) {
        expect.hasAssertions();
        expect(yield* page(name)).toStrictEqual(Option.none());
      }),
    );
  });
});
