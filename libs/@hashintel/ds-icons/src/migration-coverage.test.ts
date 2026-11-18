import { describe, expect, it } from "vitest";

import inventory from "../docs/icon-migration-map.json";
import { hashIconNames } from "./hash-icon";

describe("repository icon counterparts", () => {
  it("maps every classified interface symbol to canonical artwork", () => {
    const names = new Set<string>(hashIconNames);
    for (const record of inventory.records) {
      expect(record.classification, record.source).not.toBe("unmapped");
      if ("target" in record && record.target) {
        expect(names.has(record.target), record.source).toBe(true);
      }
      if ("targets" in record && record.targets) {
        for (const name of record.targets)
          expect(names.has(name), record.source).toBe(true);
      }
    }
  });
});
