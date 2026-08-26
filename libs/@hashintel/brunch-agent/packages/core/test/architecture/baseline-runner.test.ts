import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, describe, expect, test } from "vitest";

import { CONTEXT_ROOT, contextRootPresent } from "./workspace";

const BASELINE_PROTOCOL_DIR = join(
  CONTEXT_ROOT,
  "evaluations/protocols/process-model-elicitation/baseline",
);
const BASELINE_CASE_DIR = join(
  CONTEXT_ROOT,
  "evaluations/cases/process-model-elicitation/baseline",
);
const STUB_MODULE = pathToFileURL(
  join(import.meta.dirname, "fixtures/baseline-anthropic-stub.ts"),
).href;
const temporaryDirectories: string[] = [];

interface StubReply {
  text: string;
  truncated?: boolean;
}

interface BaselineCopy {
  outputDirectory: string;
  protocolDirectory: string;
  testDirectory: string;
}

async function createBaselineCopy(): Promise<BaselineCopy> {
  const testDirectory = await mkdtemp(join(tmpdir(), "baseline-runner-test-"));
  temporaryDirectories.push(testDirectory);
  const protocolDirectory = join(
    testDirectory,
    "evaluations/protocols/process-model-elicitation/baseline",
  );
  const caseDirectory = join(
    testDirectory,
    "evaluations/cases/process-model-elicitation/baseline",
  );
  await Promise.all([
    cp(BASELINE_PROTOCOL_DIR, protocolDirectory, { recursive: true }),
    cp(BASELINE_CASE_DIR, caseDirectory, { recursive: true }),
  ]);
  return {
    outputDirectory: join(testDirectory, "test-output"),
    protocolDirectory,
    testDirectory,
  };
}

async function runBaseline(
  baselineCopy: BaselineCopy,
  replies: StubReply[],
  mode?: "--resume" | "--continue-final",
): Promise<{
  checkpoint: {
    stopReason: string;
    calls: unknown[];
    interviewerMessages: Array<{
      role: "user" | "assistant";
      content: string;
      truncated?: boolean;
    }>;
  };
  stderr: string;
  requests: Array<{ messages: Array<Record<string, unknown>> }>;
}> {
  const requestsPath = join(baselineCopy.testDirectory, "requests.jsonl");
  const subprocess = spawn(
    process.execPath,
    [
      "--experimental-strip-types",
      join(baselineCopy.protocolDirectory, "run.ts"),
      "1",
      ...(mode ? [mode] : []),
    ],
    {
      cwd: baselineCopy.testDirectory,
      env: {
        ...process.env,
        BRUNCH_BASELINE_ANTHROPIC_MODULE: STUB_MODULE,
        BRUNCH_BASELINE_TEST_OUTPUT_DIR: baselineCopy.outputDirectory,
        BASELINE_STUB_REPLIES: JSON.stringify(replies),
        BASELINE_STUB_REQUESTS_PATH: requestsPath,
      },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  subprocess.stderr.setEncoding("utf8");
  let stderr = "";
  subprocess.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    subprocess.once("error", reject);
    subprocess.once("close", resolve);
  });
  expect(exitCode).toBe(0);

  const checkpoint = JSON.parse(
    await readFile(
      join(baselineCopy.outputDirectory, "condition-1.raw.json"),
      "utf8",
    ),
  );
  const requests = (await readFile(requestsPath, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  return { checkpoint, stderr, requests };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe.skipIf(!contextRootPresent)(
  "baseline runner completion metadata",
  () => {
    test("rejects an output override without the stub module before API calls or output", async () => {
      const baselineCopy = await createBaselineCopy();
      let apiCalls = 0;
      const server = createServer((_request, response) => {
        apiCalls += 1;
        response.writeHead(500).end();
      });
      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", resolve);
      });
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Expected the test API server to listen on a TCP port");
      }

      const { BRUNCH_BASELINE_ANTHROPIC_MODULE: _stubModule, ...env } =
        process.env;
      const subprocess = spawn(
        process.execPath,
        [
          "--experimental-strip-types",
          join(baselineCopy.protocolDirectory, "run.ts"),
          "1",
        ],
        {
          cwd: baselineCopy.testDirectory,
          env: {
            ...env,
            ANTHROPIC_BASE_URL: `http://127.0.0.1:${address.port}`,
            BRUNCH_BASELINE_TEST_OUTPUT_DIR: baselineCopy.outputDirectory,
          },
          stdio: ["ignore", "ignore", "pipe"],
        },
      );
      subprocess.stderr.setEncoding("utf8");
      let stderr = "";
      subprocess.stderr.on("data", (chunk: string) => {
        stderr += chunk;
      });
      const exitCode = await new Promise<number | null>((resolve, reject) => {
        subprocess.once("error", reject);
        subprocess.once("close", resolve);
      });
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });

      expect(exitCode).toBe(1);
      expect(stderr).toContain(
        "BRUNCH_BASELINE_TEST_OUTPUT_DIR requires BRUNCH_BASELINE_ANTHROPIC_MODULE",
      );
      expect(apiCalls).toBe(0);
      expect(existsSync(baselineCopy.outputDirectory)).toBe(false);
    });

    test("checkpoints a truncated expert reply and stops before another interviewer call", async () => {
      const testDirectory = await createBaselineCopy();
      const result = await runBaseline(testDirectory, [
        { text: "What happens next?" },
        { text: "NO" },
        { text: "The operator begins to explain", truncated: true },
      ]);

      expect(result.checkpoint.calls).toHaveLength(3);
      expect(result.checkpoint.stopReason).toBe("expert-truncated");
      expect(result.checkpoint.interviewerMessages.at(-1)).toEqual({
        role: "user",
        content: "The operator begins to explain",
        truncated: true,
      });
      expect(result.stderr).toContain("expert reply is truncated");
    });

    test("resume regenerates a trailing truncated expert reply before continuing", async () => {
      const testDirectory = await createBaselineCopy();
      await runBaseline(testDirectory, [
        { text: "What happens next?" },
        { text: "NO" },
        { text: "Partial expert reply", truncated: true },
      ]);

      const resumed = await runBaseline(
        testDirectory,
        [
          { text: "Complete expert reply" },
          { text: "Final model" },
          { text: "YES" },
        ],
        "--resume",
      );

      expect(resumed.checkpoint.stopReason).toBe("delivered");
      expect(resumed.checkpoint.interviewerMessages).toEqual([
        expect.objectContaining({ role: "user" }),
        { role: "assistant", content: "What happens next?" },
        { role: "user", content: "Complete expert reply" },
        { role: "assistant", content: "Final model" },
      ]);
      expect(resumed.stderr).toContain("regenerating truncated expert reply");
    });

    test("checkpoints a capped non-final interviewer reply and stops before calling the expert", async () => {
      const testDirectory = await createBaselineCopy();
      const result = await runBaseline(testDirectory, [
        { text: "part-1", truncated: true },
        { text: "part-2", truncated: true },
        { text: "part-3", truncated: true },
        { text: "part-4", truncated: true },
        { text: "part-5", truncated: true },
        { text: "NO" },
      ]);

      expect(result.checkpoint.calls).toHaveLength(6);
      expect(result.checkpoint.stopReason).toBe("interviewer-truncated");
      expect(result.checkpoint.interviewerMessages.at(-1)).toEqual({
        role: "assistant",
        content: "part-1part-2part-3part-4part-5",
        truncated: true,
      });
      expect(result.stderr).toContain(
        "non-final interviewer reply is truncated",
      );
    });

    test("continues a truncated final delivery without sending checkpoint metadata", async () => {
      const testDirectory = await createBaselineCopy();
      await runBaseline(testDirectory, [
        { text: "part-1", truncated: true },
        { text: "part-2", truncated: true },
        { text: "part-3", truncated: true },
        { text: "part-4", truncated: true },
        { text: "part-5", truncated: true },
        { text: "YES" },
      ]);
      await rm(join(testDirectory.testDirectory, "requests.jsonl"));

      const continued = await runBaseline(
        testDirectory,
        [{ text: " continued" }],
        "--continue-final",
      );

      expect(continued.requests).toHaveLength(1);
      expect(continued.requests[0]?.messages).toEqual([
        expect.objectContaining({ role: "user" }),
        { role: "assistant", content: "part-1part-2part-3part-4part-5" },
        {
          role: "user",
          content:
            "You were cut off mid-document. Continue exactly from where you stopped — no preamble, no repetition.",
        },
      ]);
      for (const message of continued.requests[0]?.messages ?? []) {
        expect(Object.keys(message).sort()).toEqual(["content", "role"]);
      }
      expect(continued.checkpoint.stopReason).toBe("delivered");
      expect(continued.checkpoint.interviewerMessages.at(-1)).toEqual({
        role: "assistant",
        content: "part-1part-2part-3part-4part-5 continued",
      });
    });
  },
);
