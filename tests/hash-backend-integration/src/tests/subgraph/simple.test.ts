import path from "node:path";

import { resetToSnapshot } from "../test-server";

jest.setTimeout(60000);

describe("Empty snapshot", () => {
  it("can upload a snapshot", async () => {
    await expect(
      resetToSnapshot(path.join(__dirname, "pass", "empty.jsonl")),
    ).resolves.not.toThrowError();
  });

  it("cannot upload a snapshot without metadata", async () => {
    await expect(
      resetToSnapshot(path.join(__dirname, "fail", "empty.jsonl")),
    ).rejects.toThrow("does not contain metadata");
  });

  it("cannot upload a snapshot with wrong version", async () => {
    await expect(
      resetToSnapshot(path.join(__dirname, "fail", "wrong-version.jsonl")),
    ).rejects.toThrow("contains unsupported entries");
  });
});
