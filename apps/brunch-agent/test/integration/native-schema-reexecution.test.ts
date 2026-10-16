import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script.ts";

const repositoryRoot = join(import.meta.dirname, "../../../..");
const script = join(
  import.meta.dirname,
  "native-schema-reexecution.integration.ts",
);

test("durable re-execution parses the retained raw call with the native schema", async () => {
  const directory = await mkdtemp(join(tmpdir(), "brunch-native-reexecution-"));
  try {
    const create = await runNodeScript(script, repositoryRoot, {
      NATIVE_REEXECUTION_DIRECTORY: directory,
      NATIVE_REEXECUTION_PHASE: "create",
    });
    expect(create.signal, create.stderr + create.stdout).toBe("SIGKILL");
    const recover = await runNodeScript(script, repositoryRoot, {
      NATIVE_REEXECUTION_DIRECTORY: directory,
      NATIVE_REEXECUTION_PHASE: "recover",
    });
    expect(recover.exitCode, recover.stderr + recover.stdout).toBe(0);

    const events = (await readFile(join(directory, "events.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map(
        (line) =>
          JSON.parse(line) as {
            phase: string;
            event: string;
            data?: { unsupported: { blocksRun?: boolean }[] };
            tools?: {
              toolCallId: string;
              state: string;
              input: unknown;
              output: unknown;
            }[];
          },
      );
    const recovered = events.filter(({ phase }) => phase === "recover");
    // One native validation, then one run receiving its parsed output.
    expect(recovered.map(({ event }) => event)).toEqual([
      "validate",
      "run",
      "history",
    ]);
    expect(recovered[1]?.data?.unsupported[0]?.blocksRun).toBe(true);
    const tools = recovered[2]?.tools ?? [];
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      toolCallId: "draft-durable",
      state: "output-available",
      output: { blocksRun: true },
    });
    expect(JSON.stringify(tools[0]?.input)).not.toContain("blocksRun");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 150_000);
