import { describe, expect, test } from "vitest";

import {
  localStorageDemoRouteIdentity,
  validateLocalStorageDemoSearch,
  withLocalStorageDemoIdentity,
} from "./local-storage-demo-search";

describe("local storage demo search", () => {
  test("keeps ordinary and worked-model-bundle as the only route identities", () => {
    expect(localStorageDemoRouteIdentity({})).toBe("ordinary");
    expect(localStorageDemoRouteIdentity({ subnet: "subnet-1" })).toBe(
      "ordinary",
    );
    expect(
      localStorageDemoRouteIdentity({ bundle: "inventory-purchasing" }),
    ).toBe("worked-model-bundle");
  });

  test("validates and carries the bundle across shared-location writes", () => {
    const search = validateLocalStorageDemoSearch({
      bundle: "inventory-purchasing",
      itemType: "place",
      itemId: "on-hand",
    });
    expect(search).toMatchObject({
      bundle: "inventory-purchasing",
      itemType: "place",
      itemId: "on-hand",
    });
    expect(
      withLocalStorageDemoIdentity(search, {
        itemType: "transition",
        itemId: "purchase",
      }),
    ).toMatchObject({
      bundle: "inventory-purchasing",
      itemType: "transition",
      itemId: "purchase",
    });
    expect(
      validateLocalStorageDemoSearch({ bundle: "Inventory_Purchasing" }).bundle,
    ).toBeUndefined();
  });
});
