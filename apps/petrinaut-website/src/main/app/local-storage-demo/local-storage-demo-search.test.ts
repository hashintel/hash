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

  test.each([0, 1, "0", "1"])(
    "preserves the explicit voice debug value %j through validation",
    (voiceDebug) => {
      const search = validateLocalStorageDemoSearch({ voiceDebug });
      expect(search).toMatchObject({ voiceDebug });
      expect(localStorageDemoRouteIdentity(search)).toBe("ordinary");
    },
  );

  test.each([true, false, 2, "true", "01", ""])(
    "drops invalid voice debug value %j",
    (voiceDebug) => {
      expect(
        validateLocalStorageDemoSearch({ voiceDebug }).voiceDebug,
      ).toBeUndefined();
    },
  );

  test("keeps voice debugging when setup opens and clears shared editor locations", () => {
    const initial = validateLocalStorageDemoSearch({
      bundle: "inventory-purchasing",
      voiceDebug: 1,
    });
    const settings = withLocalStorageDemoIdentity(initial, {
      overlay: "user-settings",
      settings: "labs",
    });
    expect(settings).toEqual({
      bundle: "inventory-purchasing",
      voiceDebug: 1,
      overlay: "user-settings",
      settings: "labs",
    });
    expect(withLocalStorageDemoIdentity(settings, {})).toEqual({
      bundle: "inventory-purchasing",
      voiceDebug: 1,
    });
  });

  test("honors an explicit disable instead of retaining an earlier enable", () => {
    const enabled = validateLocalStorageDemoSearch({ voiceDebug: 1 });
    const disabled = withLocalStorageDemoIdentity(
      enabled,
      validateLocalStorageDemoSearch({ voiceDebug: 0 }),
    );
    expect(disabled).toMatchObject({ voiceDebug: 0 });
    expect(withLocalStorageDemoIdentity(disabled, {})).toMatchObject({
      voiceDebug: 0,
    });
  });
});
