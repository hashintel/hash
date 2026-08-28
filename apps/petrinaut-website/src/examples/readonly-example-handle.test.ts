import { describe, expect, it } from "vitest";

import { exampleCatalog, type LoadedExample } from "./catalog";
import { getReadonlyExampleHandle } from "./readonly-example-handle";

const example: LoadedExample = {
  catalog: exampleCatalog[0]!,
  definition: {
    places: [],
    transitions: [],
    types: [],
    parameters: [],
    differentialEquations: [],
  },
};

describe("read-only example handles", () => {
  it("reuses a history-free, read-only handle per example", () => {
    const handle = getReadonlyExampleHandle(example);

    expect(getReadonlyExampleHandle(example)).toBe(handle);
    expect(handle.capabilities?.readonly).toBe(true);
    expect(handle.history).toBeUndefined();

    handle.change((draft) => {
      draft.subnets = [];
    });

    expect(handle.doc()?.subnets).toBeUndefined();
  });
});
