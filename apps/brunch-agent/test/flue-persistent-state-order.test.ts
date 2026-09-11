import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { expect, test } from "vitest";

interface HookStateWrite {
  name: string;
  value: unknown;
}

interface HookStateBuffer {
  current(name: string): { value: unknown } | undefined;
  write(name: string, value: unknown): void;
  drain(toolCallId?: string): HookStateWrite[];
  runForTool<Result>(toolCallId: string, run: () => Result): Result;
}

test("persists parallel tool writes in setter order rather than completion order", async () => {
  // This package patch changes a private runtime seam. Resolve its generated
  // chunk from the public entrypoint so a package rebuild fails loudly instead
  // of silently dropping the regression.
  const runtimeDirectory = dirname(
    fileURLToPath(import.meta.resolve("@flue/runtime")),
  );
  const stateChunks = (await readdir(runtimeDirectory)).filter((name) =>
    /^use-persistent-state-.*\.mjs$/u.test(name),
  );
  expect(stateChunks).toHaveLength(1);
  const stateChunk = stateChunks[0];
  if (!stateChunk) throw new Error("Missing Flue persistent-state chunk");
  const internal = (await import(
    pathToFileURL(join(runtimeDirectory, stateChunk)).href
  )) as Record<string, unknown>;
  const createHookStateBuffer = internal.t as
    | ((snapshot: Map<string, unknown>) => HookStateBuffer)
    | undefined;
  if (!createHookStateBuffer)
    throw new Error("Missing patched Flue hook-state buffer export");

  const buffer = createHookStateBuffer(new Map([["phase", "initial"]]));
  let markFirstWrite = () => {};
  const firstWrite = new Promise<void>((resolve) => {
    markFirstWrite = resolve;
  });
  let releaseFirstTool = () => {};
  const firstToolGate = new Promise<void>((resolve) => {
    releaseFirstTool = resolve;
  });

  const firstTool = buffer.runForTool("tool-a", async () => {
    buffer.write("phase", "A");
    buffer.write("first-only", true);
    markFirstWrite();
    await firstToolGate;
  });
  await firstWrite;
  await buffer.runForTool("tool-b", async () => {
    buffer.write("phase", "B");
  });

  const persisted = buffer.drain("tool-b");
  releaseFirstTool();
  await firstTool;
  persisted.push(...buffer.drain("tool-a"));

  expect(buffer.current("phase")?.value).toBe("B");
  expect(buffer.current("first-only")?.value).toBe(true);
  expect(persisted).toEqual([
    { name: "phase", value: "B", toolCallId: "tool-b", order: 2 },
    { name: "first-only", value: true, toolCallId: "tool-a", order: 1 },
  ]);

  const reduced = new Map<string, unknown>();
  for (const { name, value } of persisted) reduced.set(name, value);
  const reopened = createHookStateBuffer(reduced);
  expect(reopened.current("phase")?.value).toBe("B");
  expect(reopened.current("first-only")?.value).toBe(true);
});
