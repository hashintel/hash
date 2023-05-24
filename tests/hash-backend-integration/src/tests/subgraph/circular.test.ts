import path from "node:path";

import { resetGraph, restoreSnapshot } from "../test-server";

jest.setTimeout(60000);

afterAll(async () => {
  await resetGraph();
});

describe("Circular Snapshot", () => {
  it("can restore snapshot", async () => {
    await expect(
      restoreSnapshot(path.join(__dirname, "pass", "circular.jsonl")),
    ).resolves.not.toThrowError();
  });
});
