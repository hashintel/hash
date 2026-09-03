import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test } from "vitest";

import { runNodeScript } from "./run-node-script";

import type {
  PetrinautChatResult,
  PetrinautResumeResult,
} from "./petrinaut-chat-result";
import type { TransportInspectionEvent } from "@hashintel/brunch-agent-transport-aisdk";

const testDirectory = import.meta.dirname;

test("the committed /api/chat door streams a plain Flue agent through server and client tools", async () => {
  const dbDirectory = await mkdtemp(join(tmpdir(), "brunch-chat-"));
  const dbPath = join(dbDirectory, "conversations.db");

  try {
    const { exitCode, stdout, stderr } = await runNodeScript(
      join(testDirectory, "petrinaut-chat.integration.ts"),
      join(testDirectory, "../../.."),
      { BRUNCH_CHAT_DB_PATH: dbPath },
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
      result.partIds.every((partId) =>
        partId.startsWith(`${result.messageId}:`),
      ),
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
      toolName: "readPetrinautDoc",
      input: { doc: "ai-assistant" },
    });
    expect(result.clientToolCall).not.toHaveProperty("dynamic");
    expect(result.clientToolCall).not.toHaveProperty("providerExecuted");
    expect(result.clientToolOutputsOnInitial).toEqual([]);
    expect(result.latestNetDefinitionCall).toMatchObject({
      type: "tool-input-available",
      toolName: "getLatestNetDefinition",
      input: {},
    });
    expect(result.latestNetDefinitionCall).not.toHaveProperty("dynamic");
    expect(result.latestNetDefinitionCall).not.toHaveProperty(
      "providerExecuted",
    );
    expect(result.latestNetDefinitionOutputsOnInitial).toEqual([]);
    expect(result.initialFinish).toEqual({
      type: "finish",
      finishReason: "tool-calls",
    });
    expect(result.pendingHistoryClientToolState).toBe("input-available");
    expect(result.pendingHistoryLatestNetDefinitionState).toBe(
      "input-available",
    );

    expect(result.resumedStatus).toBe(200);
    expect(result.resumedTextBeforeAsk).toContain("Invoice review conveyor");
    expect(result.resumedTextBeforeAsk).toContain("Incoming invoices");
    expect(result.resumedTextBeforeAsk).toContain("Review invoice");
    expect(result.resumedTextBeforeAsk).toContain("Approved invoices");
    expect(result.resumedTextBeforeAsk).toContain(
      "The guide says the assistant can read its own documentation pages.",
    );
    expect(result.askCall).toMatchObject({
      type: "tool-input-available",
      toolName: "brunch_ask",
      input: {
        question: "What should happen when review cannot approve an invoice?",
      },
      dynamic: true,
    });
    expect(result.askCall).not.toHaveProperty("providerExecuted");
    expect(result.askToolOutputsBeforeResume).toEqual([]);
    expect(result.resumedFinish).toEqual({
      type: "finish",
      finishReason: "tool-calls",
    });
    expect(result.pendingHistoryAskState).toBe("input-available");
    expect(result.answerResumeStatus).toBe(200);
    expect(result.answerResumeText).toContain(
      "I received your answer: send it to manual review.",
    );
    expect(result.answerResumeFinish).toEqual({
      type: "finish",
      finishReason: "stop",
    });
    expect(result.retriedStatus).toBe(200);
    expect(result.retriedResumeStatus).toBe(200);
    expect(result.historyUserEntryCount).toBe(1);
    expect(result.historyClientToolResultCount).toBe(2);

    expect(result.historyGetStatus).toBe(200);
    expect(result.historyUserText).toContain(
      "Interview this Petri net. What does it do?",
    );
    expect(result.historyUserText).not.toContain("Invoice review conveyor");
    expect(result.foreignHistoryMessages).toBe(0);
    expect(result.unauthenticatedHistoryStatus).toBe(401);
    expect(result.foreignAgentHistoryStatus).toBe(403);
    expect(result.transcript).toContain(
      "Interview this Petri net. What does it do?",
    );
    expect(result.transcript).toContain("Checking the server, then the docs.");
    expect(result.transcript).toContain("tool ping");
    expect(result.transcript).toContain("tool getLatestNetDefinition");
    expect(result.transcript).toContain('"title":"Invoice review conveyor"');
    expect(result.transcript).toContain("tool readPetrinautDoc");
    expect(result.transcript).toContain("tool brunch_ask");
    expect(result.transcript).toContain(
      '"output":{"answer":"Send it to manual review."}',
    );
    expect(result.transcript).toContain("tool activate_skill");
    expect(result.transcript).toContain(
      "The assistant can read its own documentation pages.",
    );
    expect(result.activateSkillCall).toMatchObject({
      type: "tool-input-available",
      toolName: "activate_skill",
      input: { name: "confirm-path" },
    });
    expect(result.interviewerToolNames).toEqual([
      "activate_skill",
      "ping",
      "getLatestNetDefinition",
      "readPetrinautDoc",
      "brunch_ask",
    ]);
    expect(result.captureIds.length).toBe(1);
    expect(result.captureExcerpts).toEqual([
      "Interview this Petri net. What does it do?",
    ]);
    expect(result.capturePayloads).toEqual([{}]);
    expect(result.recaptureIds).toEqual(result.captureIds);
    expect(result.skippedDedupKeys.length).toBeGreaterThan(0);
    expect(result.captureUserText).toContain(
      "Interview this Petri net. What does it do?",
    );

    expect(inspectionLines[0]).toMatchObject({
      type: "request-start",
      requestId: "request-mission-1",
    });
    expect(inspectionLines.some((event) => event.type === "resume-start")).toBe(
      true,
    );
    expect(
      inspectionLines.filter((event) => event.type === "request-finish"),
    ).toEqual([
      {
        type: "request-finish",
        requestId: "request-mission-1",
        terminal: "completed",
      },
      {
        type: "request-finish",
        requestId: "request-mission-1-resume",
        terminal: "completed",
      },
      {
        type: "request-finish",
        requestId: "request-mission-1-ask-resume",
        terminal: "completed",
      },
      {
        type: "request-finish",
        requestId: "request-mission-1-resume-retry",
        terminal: "completed",
      },
      {
        type: "request-finish",
        requestId: "request-mission-1-retry",
        terminal: "completed",
      },
    ]);
    expect(
      inspectionLines.filter((event) => event.type === "history-read"),
    ).toHaveLength(4);

    const resumed = await runNodeScript(
      join(testDirectory, "petrinaut-chat.integration.ts"),
      join(testDirectory, "../../.."),
      {
        BRUNCH_CHAT_DB_PATH: dbPath,
        BRUNCH_RESUME_PHASE: "1",
      },
    );
    expect(resumed.exitCode, resumed.stderr || resumed.stdout).toBe(0);
    const resumeLine = resumed.stdout
      .split("\n")
      .find((line) => line.startsWith("PETRINAUT_RESUME_RESULT "));
    expect(resumeLine, resumed.stdout).toBeDefined();
    const resumeResult = JSON.parse(
      resumeLine!.slice("PETRINAUT_RESUME_RESULT ".length),
    ) as PetrinautResumeResult;
    expect(resumeResult.historyGetStatus).toBe(200);
    expect(resumeResult.historyUserText).toContain(
      "Interview this Petri net. What does it do?",
    );
    expect(resumeResult.transcript).toContain("tool ping");
    expect(resumeResult.transcript).toContain("tool getLatestNetDefinition");
    expect(resumeResult.transcript).toContain("tool readPetrinautDoc");
    expect(resumeResult.transcript).toContain("tool brunch_ask");
    expect(resumeResult.transcript).toContain("tool activate_skill");
  } finally {
    await rm(dbDirectory, { recursive: true, force: true });
  }
});
