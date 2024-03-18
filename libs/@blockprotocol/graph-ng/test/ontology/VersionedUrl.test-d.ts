import { Brand } from "effect";
import { expectTypeOf, test } from "vitest";

import * as BaseUrl from "../../src/BaseUrl.js";
import * as VersionedUrl from "../../src/VersionedUrl.js";

test("parseOrThrow(const)", () => {
  const value = VersionedUrl.parseOrThrow("https://example.com/v/1");

  expectTypeOf(value).toMatchTypeOf<VersionedUrl.VersionedUrl>();
  expectTypeOf(value).toMatchTypeOf<
    VersionedUrl.VersionedUrl<"https://example.com">
  >();
});

test("parseOrThrow(non-const)", () => {
  const value = VersionedUrl.parseOrThrow("https://example.com/v/1" as string);

  expectTypeOf(value).toMatchTypeOf<VersionedUrl.VersionedUrl>();
  expectTypeOf(value).not.toMatchTypeOf<
    VersionedUrl.VersionedUrl<"https://example.com">
  >();
});

test("base(const)", () => {
  const value = VersionedUrl.parseOrThrow("https://example.com/v/1");
  const base = VersionedUrl.base(value);

  expectTypeOf(base).toMatchTypeOf<BaseUrl.BaseUrl>();
  expectTypeOf(base).toMatchTypeOf<
    "https://example.com" & Brand.Brand<BaseUrl.TypeId>
  >();
});

test("base(non-const)", () => {
  const value = VersionedUrl.parseOrThrow("https://example.com/v/1" as string);
  const base = VersionedUrl.base(value);

  expectTypeOf(base).toMatchTypeOf<BaseUrl.BaseUrl>();
  expectTypeOf(base).not.toMatchTypeOf<
    "https://example.com" & Brand.Brand<BaseUrl.TypeId>
  >();
});
