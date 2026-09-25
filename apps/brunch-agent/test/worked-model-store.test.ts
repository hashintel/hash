import { describe, expect, test } from "vitest";

import {
  createInMemoryWorkedModelStore,
  parseWorkedModelFixture,
} from "../src/worked-model-store.ts";
import {
  workedModelFixture as fixture,
  workedModelStoreContract,
} from "./worked-model-store-contract.ts";

describe("worked-model net-projection store", () => {
  test("validates build-discovered fixture identity, source and content", () => {
    expect(parseWorkedModelFixture(fixture())).toMatchObject(fixture());
    expect(() =>
      parseWorkedModelFixture({
        ...fixture(),
        sourceManifestSha256: "not-a-hash",
      }),
    ).toThrow(/sourceManifestSha256/u);
    expect(() =>
      parseWorkedModelFixture({
        ...fixture(),
        bundleKey: "Inventory_Purchasing",
      }),
    ).toThrow(/kebab-case/u);
    expect(() =>
      parseWorkedModelFixture({
        ...fixture(),
        session: { messages: [] },
      }),
    ).toThrow(/session/u);
    expect(() =>
      parseWorkedModelFixture({
        ...fixture(),
        revisionId: "",
      }),
    ).toThrow(/revisionId/u);
  });

  describe("in memory", () => {
    workedModelStoreContract(async (createId) =>
      createInMemoryWorkedModelStore(createId),
    );
  });
});
