import path from "node:path";

import { restoreSnapshot } from "../setup";

jest.setTimeout(60000);

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
});
