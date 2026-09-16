import { expect, test } from "vitest";

import {
  readBrowserStorage,
  removeBrowserStorage,
  writeBrowserStorage,
} from "./browser-storage";

test("contains unavailable browser storage operations", () => {
  const unavailableStorage = {
    getItem: () => {
      throw new DOMException("blocked", "SecurityError");
    },
    removeItem: () => {
      throw new DOMException("blocked", "SecurityError");
    },
    setItem: () => {
      throw new DOMException("full", "QuotaExceededError");
    },
  } as unknown as Storage;

  expect(readBrowserStorage(unavailableStorage, "key")).toBeNull();
  expect(() =>
    writeBrowserStorage(unavailableStorage, "key", "value"),
  ).not.toThrow();
  expect(() => removeBrowserStorage(unavailableStorage, "key")).not.toThrow();
});
