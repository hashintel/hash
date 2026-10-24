/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defaultDslText,
  dslFileStorageKey,
  loadDslFile,
  saveDslFile,
} from "./dsl-file";

afterEach(() => {
  localStorage.removeItem(dslFileStorageKey);
  vi.restoreAllMocks();
});

describe("the DSL file", () => {
  it("reads back what was saved, under one key", () => {
    expect(loadDslFile()).toBeNull();

    expect(saveDslFile('net "Mine"\nplace A\n')).toBe(true);

    expect(loadDslFile()).toBe('net "Mine"\nplace A\n');
    expect(localStorage.getItem(dslFileStorageKey)).toBe(
      'net "Mine"\nplace A\n',
    );
  });

  it("reports a refused write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });

    expect(saveDslFile("place A\n")).toBe(false);
  });

  it("opens a first visit on the first DSL example", () => {
    expect(defaultDslText()).toContain('net "Coffee counter"\n');
  });
});
