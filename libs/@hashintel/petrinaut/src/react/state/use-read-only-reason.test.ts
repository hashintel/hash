import { describe, expect, it } from "vitest";

import { mutationBlockedBy } from "./use-read-only-reason";

describe("mutationBlockedBy", () => {
  it("lets every mutation run while nothing is read-only", () => {
    expect(mutationBlockedBy("addPlace", null)).toBeNull();
  });

  it("keeps scenario and metric mutations available in simulate mode", () => {
    const reason = { kind: "simulate-mode" } as const;

    expect(mutationBlockedBy("addScenario", reason)).toBeNull();
    expect(mutationBlockedBy("addPlace", reason)).toBe(reason);
  });

  it("blocks every mutation on a read-only host", () => {
    const reason = { kind: "host-readonly" } as const;

    expect(mutationBlockedBy("addScenario", reason)).toBe(reason);
  });
});
