import fs from "node:fs";
import os from "node:os";

import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LocalFileSystemStorageProvider } from "./local-file-storage";

const createProvider = () =>
  new LocalFileSystemStorageProvider({
    app: express(),
    fileUploadPath: os.tmpdir(),
    apiOrigin: "http://localhost:5001",
  });

describe("LocalFileSystemStorageProvider.getObjectLastModified", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when the object does not exist", async () => {
    vi.spyOn(fs.promises, "stat").mockRejectedValue(
      Object.assign(new Error("File not found"), { code: "ENOENT" }),
    );

    await expect(
      createProvider().getObjectLastModified({ key: "missing.json" }),
    ).resolves.toBeNull();
  });

  it("propagates storage errors other than not found", async () => {
    const storageError = Object.assign(new Error("Permission denied"), {
      code: "EACCES",
    });
    vi.spyOn(fs.promises, "stat").mockRejectedValue(storageError);

    await expect(
      createProvider().getObjectLastModified({ key: "unreadable.json" }),
    ).rejects.toBe(storageError);
  });
});
