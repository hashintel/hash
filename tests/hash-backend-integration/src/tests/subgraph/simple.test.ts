import path from "node:path";

import { afterAll, describe, expect, test } from "vitest";

import { resetGraph, restoreSnapshot } from "../test-server";

afterAll(async () => {
  await resetGraph();
});

describe("empty snapshot", () => {
  test("can upload a snapshot", async () => {
    await expect(
      restoreSnapshot(path.join(__dirname, "pass", "empty.jsonl")),
    ).resolves.not.toThrowError();
  });

  test("cannot upload a snapshot without metadata", async () => {
    await expect(
      restoreSnapshot(path.join(__dirname, "fail", "empty.jsonl")),
    ).rejects.toThrow("does not contain metadata");
  });

  test("cannot upload a snapshot with wrong version", async () => {
    await expect(
      restoreSnapshot(path.join(__dirname, "fail", "wrong-version.jsonl")),
    ).rejects.toThrow("contains unsupported entries");
  });
});
