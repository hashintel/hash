import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

import type { PetrinautChatResult } from "./petrinaut-chat-result";
import type { TransportInspectionEvent } from "@hashintel/brunch-agent-transport-aisdk";
import type { UIMessageChunk } from "ai";

const testDirectory = import.meta.dirname;

const normalizedChunk = (
  chunk: UIMessageChunk,
  messageId: string,
): UIMessageChunk => {
  const normalized = structuredClone(chunk);
  if ("messageId" in normalized && normalized.messageId === messageId)
    normalized.messageId = "$message";
  if ("id" in normalized && typeof normalized.id === "string")
    normalized.id = normalized.id.replace(messageId, "$message");
  return normalized;
};

type DeltaChunk = Extract<
  UIMessageChunk,
  { type: `${string}-delta`; id: string; delta: string }
>;

const isDeltaChunk = (chunk: UIMessageChunk): chunk is DeltaChunk =>
  chunk.type.endsWith("-delta") &&
  "id" in chunk &&
  typeof chunk.id === "string" &&
  "delta" in chunk &&
  typeof chunk.delta === "string";

const normalizedChunks = (
  chunks: readonly UIMessageChunk[],
  messageId: string,
): UIMessageChunk[] =>
  chunks.reduce<UIMessageChunk[]>((normalized, chunk) => {
    const current = normalizedChunk(chunk, messageId);
    const previous = normalized.at(-1);
    if (
      isDeltaChunk(current) &&
      previous !== undefined &&
      isDeltaChunk(previous) &&
      previous.type === current.type &&
      previous.id === current.id
    ) {
      previous.delta += current.delta;
      return normalized;
    }
    normalized.push(current);
    return normalized;
  }, []);

test("the committed application route drives the actual elicitor for reasoning and text", async () => {
  const { exitCode, stdout, stderr } = await runNodeScript(
    join(testDirectory, "petrinaut-chat.integration.ts"),
    join(testDirectory, "../../.."),
  );

  expect(exitCode, stderr || stdout).toBe(0);
  const inspectionLines = stdout
    .split("\n")
    .filter((line) => line.startsWith("TRANSPORT_AISDK "))
    .map(
      (line) =>
        JSON.parse(
          line.slice("TRANSPORT_AISDK ".length),
        ) as TransportInspectionEvent,
    );
  const resultLine = stdout
    .split("\n")
    .find((line) => line.startsWith("PETRINAUT_CHAT_RESULT "));
  expect(resultLine, stdout).toBeDefined();
  const result = JSON.parse(
    resultLine!.slice("PETRINAUT_CHAT_RESULT ".length),
  ) as PetrinautChatResult;

  expect(result.status).toBe(200);
  expect(result.messageId).toBeDefined();
  if (result.messageId === undefined) throw new Error("missing message id");
  expect(result.messageId.length).toBeGreaterThan(0);
  expect(
    result.partIds.every((partId) => partId.startsWith(`${result.messageId}:`)),
  ).toBe(true);
  expect(result.reasoning).toContain("establish the process outcome");
  expect(result.text).toContain(
    "What outcome should this process reliably produce?",
  );
  expect(result.finish).toEqual({ type: "finish", finishReason: "stop" });
  const golden = JSON.parse(
    readFileSync(
      join(
        testDirectory,
        "../../../libs/@hashintel/brunch-agent/packages/transport-aisdk/test/fixtures/elicitor-initial.normalized.json",
      ),
      "utf8",
    ),
  ) as UIMessageChunk[];
  expect(normalizedChunks(result.chunks, result.messageId)).toEqual(golden);
  expect(inspectionLines[0]).toMatchObject({
    type: "request-start",
    requestId: "request-fe1436-application",
  });
  expect(inspectionLines.at(-1)).toMatchObject({
    type: "request-finish",
    terminalState: "completed",
  });
});
