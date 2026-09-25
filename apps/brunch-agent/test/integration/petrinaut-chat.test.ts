import { join } from "node:path";

import { expect, test } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent";

import { runNodeScript } from "./run-node-script";

import type { PetrinautChatResult } from "./petrinaut-chat-result";

const testDirectory = import.meta.dirname;

test("the browser transport streams the mounted Flue agent through server and client tools", async () => {
  const { exitCode, stdout, stderr } = await runNodeScript(
    join(testDirectory, "petrinaut-chat.integration.ts"),
    join(testDirectory, "../../../.."),
  );

  expect(exitCode, stderr || stdout).toBe(0);
  const resultLine = stdout
    .split("\n")
    .find((line) => line.startsWith("PETRINAUT_CHAT_RESULT "));
  expect(resultLine, stdout).toBeDefined();
  const result = JSON.parse(
    resultLine!.slice("PETRINAUT_CHAT_RESULT ".length),
  ) as PetrinautChatResult;

  expect(result.messageId).toBeDefined();
  if (result.messageId === undefined) throw new Error("missing message id");
  expect(result.messageId.length).toBeGreaterThan(0);
  expect(
    result.partIds.every((partId) => partId.startsWith(`${result.messageId}:`)),
  ).toBe(true);
  expect(result.reasoning).toContain("Confirm the server path");
  expect(result.text).toContain("Checking the server, then the docs.");
  expect(result.pingCall).toMatchObject({
    type: "tool-input-available",
    toolName: "ping",
    input: { note: "health" },
    providerExecuted: true,
  });
  expect(result.pingOutput).toEqual({ ok: true, note: "health" });
  expect(result.clientToolCall).toMatchObject({
    type: "tool-input-available",
    toolName: brunchTools.readPetrinautDocs,
    input: { doc: "ai-assistant" },
  });
  expect(result.clientToolCall).not.toHaveProperty("providerExecuted");
  expect(result.clientToolOutputsOnInitial).toEqual([]);
  expect(result.initialFinish).toEqual({
    type: "finish",
    finishReason: "tool-calls",
  });
  expect(result.pendingHistoryClientToolState).toBe("input-available");

  expect(result.resumedText).toContain(
    "The guide says the assistant can read its own documentation pages.",
  );
  expect(result.resumedFinish).toEqual({
    type: "finish",
    finishReason: "stop",
  });
  expect(result.resumedText).toContain(
    "Which documentation page should we inspect next?",
  );
  expect(result.questionResponseProviderCalls).toBe(1);
  expect(result.historyUserEntryCount).toBe(1);
  expect(result.historyClientToolResultCount).toBe(1);
  expect(result.historyUserText).toContain("Run the FE-1435 transport probe.");

  expect(result.activateSkillCall).toMatchObject({
    type: "tool-input-available",
    toolName: "activate_skill",
    input: { name: "sdcpn-modelling" },
  });
  expect(result.readSkillResourceCall).toMatchObject({
    type: "tool-input-available",
    toolName: "read_skill_resource",
  });
  expect(JSON.stringify(result.readSkillResourceCall?.input ?? {})).toContain(
    "profile.md",
  );
});
