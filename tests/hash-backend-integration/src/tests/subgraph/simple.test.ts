import path from "node:path";

import { resetGraph, restoreSnapshot } from "../test-server";

jest.setTimeout(60000);

afterAll(async () => {
  await resetGraph();
});

describe("Empty snapshot", () => {
  it("can upload a snapshot", async () => {
    await expect(
      restoreSnapshot(path.join(__dirname, "pass", "empty.jsonl")),
    ).resolves.not.toThrowError();
  });

  it("cannot upload a snapshot without metadata", async () => {
    await expect(
      restoreSnapshot(path.join(__dirname, "fail", "empty.jsonl")),
    ).rejects.toThrow("does not contain metadata");
  });

  it("cannot upload a snapshot with wrong version", async () => {
    await expect(
      restoreSnapshot(path.join(__dirname, "fail", "wrong-version.jsonl")),
    ).rejects.toThrow("contains unsupported entries");
  });
});
