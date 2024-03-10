import { expect, test } from "vitest";

import * as PropertyTypeUrl from "../../src/ontology/PropertyTypeUrl";
import * as BaseUrl from "../../src/BaseUrl";
import * as VersionedUrl from "../../src/VersionedUrl";
import * as PropertyObject from "../../src/knowledge/PropertyObject";
import { pipe } from "effect";

const FilePropertiesUrl = PropertyTypeUrl.parseOrThrow(
  "https://blockprotocol.org/@blockprotocol/types/property-type/file-properties/v/1",
);

const DisplayNamePropertyUrl = PropertyTypeUrl.parseOrThrow(
  "https://blockprotocol.org/@blockprotocol/types/property-type/display-name/v/1",
);

test("PropertyObject: constant", () => {
  const payload = {
    [pipe(FilePropertiesUrl, VersionedUrl.base, BaseUrl.raw)]: "abc",
  } as const;

  const values = PropertyObject.make(payload);
  const value = PropertyObject.get(
    values,
    VersionedUrl.base(FilePropertiesUrl),
  );

  expect(value).toBe("abc");
});

test("PropertyObject: incorrect key", () => {
  const payload = {
    [pipe(FilePropertiesUrl, VersionedUrl.base, BaseUrl.raw)]: "abc",
  } as const;

  const values = PropertyObject.make(payload);
  const value = PropertyObject.get(
    values,
    VersionedUrl.base(DisplayNamePropertyUrl),
  );
});
