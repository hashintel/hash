import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { MAX_REQUEST_LINE_BYTES } from "../runtime/protocol";
import { serve } from "./serve";
import { serveStdio } from "./stdio";

const modelPath = fileURLToPath(
  new URL("../../examples/sir-model.json", import.meta.url),
);
const coloredModelPath = fileURLToPath(
  new URL("../../examples/satellites-launcher.json", import.meta.url),
);
const temporaryDirectories: string[] = [];

function parseResponses(output: string): unknown[] {
  return output
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("CLI transports", () => {
  it("exchanges metadata and run requests over stdio", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const errorOutput = new PassThrough();
    let stdout = "";
    output.setEncoding("utf8");
    output.on("data", (chunk: string) => {
      stdout += chunk;
    });

    const serving = serveStdio({ modelPath, input, output, errorOutput });
    input.end(
      [
        JSON.stringify({ id: 1, method: "metadata" }),
        JSON.stringify({
          id: 2,
          method: "run",
          params: { maxSteps: 0, seed: 42 },
        }),
        "",
      ].join("\n"),
    );
    await serving;

    const responses = parseResponses(stdout);
    expect(responses).toHaveLength(2);
    expect(responses[0]).toMatchObject({
      id: 1,
      result: { parameters: expect.any(Array), places: expect.any(Array) },
    });
    expect(responses[1]).toMatchObject({
      id: 2,
      result: { seed: 42, completionReason: "maxSteps" },
    });
  });

  it("simulates multiple colored tokens over stdio", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    let stdout = "";
    output.setEncoding("utf8");
    output.on("data", (chunk: string) => {
      stdout += chunk;
    });

    const serving = serveStdio({
      modelPath: coloredModelPath,
      input,
      output,
      errorOutput: new PassThrough(),
    });
    input.end(
      `${JSON.stringify({
        id: 1,
        method: "run",
        params: {
          initialState: {
            Space: [
              { x: 90, y: 0, direction: 1.5708, velocity: 67 },
              { x: -90, y: 0, direction: -1.5708, velocity: 67 },
            ],
            Debris: [],
          },
          metrics: ["Satellites in orbit"],
          maxSteps: 1,
          dt: 0.1,
          seed: 4242,
        },
      })}\n`,
    );
    await serving;

    expect(parseResponses(stdout)).toMatchObject([
      {
        id: 1,
        result: {
          seed: 4242,
          finalPlaceTokenCounts: {
            "3cbc7944-34cb-4eeb-b779-4e392a171fe1": 2,
            "ea42ba61-03ea-4940-b2e2-b594d5331a71": 0,
          },
          metrics: { "Satellites in orbit": 2 },
        },
      },
    ]);
  });

  it("handles chunked and trailing requests over a Unix socket", async () => {
    const directory = await mkdtemp(join(tmpdir(), "petrinaut-cli-"));
    temporaryDirectories.push(directory);
    const socketPath = join(directory, "petrinaut.sock");
    const controller = new AbortController();
    const serving = serve({
      modelPath,
      socketPath,
      signal: controller.signal,
      errorOutput: new PassThrough(),
    });

    try {
      await vi.waitFor(() => expect(existsSync(socketPath)).toBe(true));

      const output = await new Promise<string>((resolveOutput, reject) => {
        const socket = createConnection(socketPath);
        let response = "";
        socket.setEncoding("utf8");
        socket.on("data", (chunk) => {
          response += chunk;
        });
        socket.once("error", reject);
        socket.once("end", () => resolveOutput(response));
        socket.once("connect", () => {
          socket.write('{"id":1,"method":"meta');
          socket.write('data"}\n');
          socket.end(
            JSON.stringify({
              id: 2,
              method: "run",
              params: { maxSteps: 0, seed: 42 },
            }),
          );
        });
      });

      const responses = parseResponses(output);
      expect(responses).toHaveLength(2);
      expect(responses[0]).toMatchObject({ id: 1, result: {} });
      expect(responses[1]).toMatchObject({
        id: 2,
        result: { seed: 42, completionReason: "maxSteps" },
      });
    } finally {
      controller.abort();
      await serving;
    }

    expect(existsSync(socketPath)).toBe(false);
  });

  it("flushes queued socket responses before closing an oversized request", async () => {
    const directory = await mkdtemp(join(tmpdir(), "petrinaut-cli-"));
    temporaryDirectories.push(directory);
    const socketPath = join(directory, "petrinaut.sock");
    const controller = new AbortController();
    const serving = serve({
      modelPath,
      socketPath,
      signal: controller.signal,
      errorOutput: new PassThrough(),
    });

    try {
      await vi.waitFor(() => expect(existsSync(socketPath)).toBe(true));

      const output = await new Promise<string>((resolveOutput, reject) => {
        const socket = createConnection(socketPath);
        let response = "";
        socket.setEncoding("utf8");
        socket.on("data", (chunk) => {
          response += chunk;
        });
        socket.once("error", reject);
        socket.once("end", () => resolveOutput(response));
        socket.once("connect", () => {
          socket.write(`${JSON.stringify({ id: 1, method: "metadata" })}\n`);
          socket.write("x".repeat(MAX_REQUEST_LINE_BYTES + 1));
        });
      });

      const responses = parseResponses(output);
      expect(responses).toHaveLength(2);
      expect(responses[0]).toMatchObject({ id: 1, result: {} });
      expect(responses[1]).toEqual({
        id: null,
        error: { message: "Request line is too large" },
      });
    } finally {
      controller.abort();
      await serving;
    }
  });
});
