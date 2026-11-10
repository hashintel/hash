import { describe, expect, it } from "vitest";

import { keyTreeOf } from "../key-tree";
import { sdcpnFileSchema } from "../types";
import { version1Keys } from "./version-1-keys";

import type { KeyTree } from "../key-tree";

/** The keys of `tree` that `other` lacks, as dotted paths. */
const keysMissingFrom = (
  other: KeyTree | true,
  tree: KeyTree | true,
  path: string[] = [],
): string[] =>
  tree === true
    ? []
    : Object.entries(tree).flatMap(([key, beneath]) => {
        const keyPath = [...path, key];
        const otherBeneath =
          other !== true && Object.hasOwn(other, key) ? other[key] : undefined;
        return otherBeneath === undefined
          ? [keyPath.join(".")]
          : keysMissingFrom(otherBeneath, beneath, keyPath);
      });

describe("version1Keys", () => {
  const schemaKeys = keyTreeOf(sdcpnFileSchema);

  it("holds only keys the file schema still defines", () => {
    expect(keysMissingFrom(schemaKeys, version1Keys)).toEqual([]);
  });

  it("lacks exactly the keys the file format has gained since version 1", () => {
    expect(
      keysMissingFrom(version1Keys, schemaKeys),
      "A key added to the file schema is a file format change: a file that uses it is written as version 2, which builds that read only version 1 refuse. List the key here.",
    ).toEqual([]);
  });
});
