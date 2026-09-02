import {
  FlueExecutionError,
  type AgentReadResult,
  type AgentSendResult,
  type FlueClient,
  type FlueConversationPart,
  type FlueConversationSnapshot,
} from "@flue/sdk";
import { describe, expect, test, vi } from "vitest";

import {
  createBrunchTurnTool,
  createMockClientToolHost,
  createRealHeadlessClientToolHost,
  registerBrunchTurn,
  type BrunchTurnExtensionApi,
  type BrunchTurnTool,
} from "../../../libs/@hashintel/brunch-agent/.pi/extensions/brunch-persona-testing/index.ts";
import {
  AWAITING_CLIENT,
  CLIENT_TOOL_RESULT_SIGNAL,
} from "../src/conversation/client-tools";

type BrunchFlueClient = Pick<FlueClient, "history" | "read" | "send">;

const admission = (submissionId: string, uid: string): AgentSendResult => ({
  streamUrl: `http://brunch.local/stream/${submissionId}`,
  offset: "0",
  submissionId,
  uid,
});

const reply = (
  submissionId: string,
  uid: string,
  text: string,
): AgentReadResult => ({
  submissionId,
  uid,
  text,
  data: {},
});

const snapshot = (
  submissionId?: string,
  parts: FlueConversationPart[] = [],
): FlueConversationSnapshot => ({
  v: 1,
  conversationId: "test-conversation",
  offset: "1",
  messages:
    submissionId === undefined
      ? []
      : [
          {
            id: `message-${submissionId}`,
            role: "assistant",
            purpose: "assistant",
            display: "visible",
            submissionId,
            parts,
          },
        ],
  settlements:
    submissionId === undefined ? [] : [{ submissionId, outcome: "completed" }],
});

const controlledClient = (
  send: BrunchFlueClient["send"],
  read: BrunchFlueClient["read"],
  history: BrunchFlueClient["history"] = vi
    .fn<BrunchFlueClient["history"]>()
    .mockResolvedValue(snapshot()),
): BrunchFlueClient => ({ send, read, history });

const renderTheme = {
  bold: (text: string) => text,
  italic: (text: string) => text,
  strikethrough: (text: string) => text,
  underline: (text: string) => text,
  fg: (_color: string, text: string) => text,
};

describe("brunch_turn", () => {
  test("refuses to register without a usable Herdr child identity", () => {
    expect(() =>
      registerBrunchTurn(
        {
          registerTool: vi.fn<BrunchTurnExtensionApi["registerTool"]>(),
        },
        { conversationId: "   " },
      ),
    ).toThrow(/PI_SUBAGENT_NAME/u);
  });

  test("registers exactly the transport tool", () => {
    const registerTool = vi.fn<BrunchTurnExtensionApi["registerTool"]>();
    const client = controlledClient(vi.fn(), vi.fn());

    registerBrunchTurn(
      { registerTool },
      { conversationId: "persona-registration", client },
    );

    expect(registerTool).toHaveBeenCalledOnce();
    expect(registerTool.mock.calls[0]?.[0]).toMatchObject({
      name: "brunch_turn",
      executionMode: "sequential",
    });
  });

  test("sends once, reads the exact admission, and conditions later turns on its uid", async () => {
    const firstAdmission = admission("submission-1", "incarnation-1");
    const secondAdmission = admission("submission-2", "incarnation-1");
    const send = vi
      .fn<BrunchFlueClient["send"]>()
      .mockResolvedValueOnce(firstAdmission)
      .mockResolvedValueOnce(secondAdmission);
    const read = vi
      .fn<BrunchFlueClient["read"]>()
      .mockResolvedValueOnce(
        reply("submission-1", "incarnation-1", "First elicitor reply"),
      )
      .mockResolvedValueOnce(
        reply("submission-2", "incarnation-1", "Second elicitor reply"),
      );
    const tool = createBrunchTurnTool({
      conversationId: "persona-sequential",
      client: controlledClient(send, read),
    });

    const firstResult = await tool.execute("tool-call-1", {
      message: "First persona message",
    });
    const secondResult = await tool.execute("tool-call-2", {
      message: "Second persona message",
    });

    expect(send).toHaveBeenNthCalledWith(1, {
      message: { kind: "user", body: "First persona message" },
      uid: null,
      signal: undefined,
    });
    expect(send).toHaveBeenNthCalledWith(2, {
      message: { kind: "user", body: "Second persona message" },
      uid: "incarnation-1",
      signal: undefined,
    });
    expect(read).toHaveBeenNthCalledWith(1, firstAdmission, {
      signal: undefined,
    });
    expect(read).toHaveBeenNthCalledWith(2, secondAdmission, {
      signal: undefined,
    });
    expect(firstResult).toEqual({
      content: [{ type: "text", text: "First elicitor reply" }],
      details: {
        conversationId: "persona-sequential",
        submissionId: "submission-1",
        submissionIds: ["submission-1"],
        status: "elicitor-replied",
        elicitorText: "First elicitor reply",
        toolActivity: [],
      },
    });
    expect(secondResult.details).toMatchObject({
      submissionId: "submission-2",
      elicitorText: "Second elicitor reply",
    });
    expect(firstResult.details.submissionId).not.toBe(
      secondResult.details.submissionId,
    );
  });

  test("rejects empty and concurrent calls without sending them", async () => {
    let releaseAdmission: ((value: AgentSendResult) => void) | undefined;
    const pendingAdmission = new Promise<AgentSendResult>((resolve) => {
      releaseAdmission = resolve;
    });
    const send = vi
      .fn<BrunchFlueClient["send"]>()
      .mockReturnValue(pendingAdmission);
    const read = vi
      .fn<BrunchFlueClient["read"]>()
      .mockResolvedValue(
        reply("submission-active", "incarnation-active", "Continue"),
      );
    const tool = createBrunchTurnTool({
      conversationId: "persona-concurrent",
      client: controlledClient(send, read),
    });

    await expect(
      tool.execute("tool-call-empty", { message: " \n " }),
    ).rejects.toThrow(/must not be empty/u);

    const activeCall = tool.execute("tool-call-active", {
      message: "Active message",
    });
    await expect(
      tool.execute("tool-call-overlap", { message: "Overlapping message" }),
    ).rejects.toThrow(/active submission/u);

    releaseAdmission?.(admission("submission-active", "incarnation-active"));
    await activeCall;

    expect(send).toHaveBeenCalledOnce();
  });

  test("preserves a failed settlement and never sends again after admission", async () => {
    const admitted = admission("submission-failed", "incarnation-failed");
    const executionError = new FlueExecutionError({
      target: "agent_submission",
      targetId: admitted.submissionId,
      failure: "failed",
      error: { message: "provider failed" },
    });
    const send = vi.fn<BrunchFlueClient["send"]>().mockResolvedValue(admitted);
    const read = vi
      .fn<BrunchFlueClient["read"]>()
      .mockRejectedValue(executionError);
    const tool = createBrunchTurnTool({
      conversationId: "persona-failed",
      client: controlledClient(send, read),
    });

    await expect(
      tool.execute("tool-call-failed", { message: "Admitted once" }),
    ).rejects.toBe(executionError);
    expect(executionError).toMatchObject({
      targetId: "submission-failed",
      failure: "failed",
    });

    await expect(
      tool.execute("tool-call-after-failure", {
        message: "Must not be admitted",
      }),
    ).rejects.toThrow(/inspect canonical Flue history/u);
    expect(send).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledOnce();
  });

  test("treats empty assistant text as a terminal protocol failure", async () => {
    const admitted = admission("submission-empty", "incarnation-empty");
    const send = vi.fn<BrunchFlueClient["send"]>().mockResolvedValue(admitted);
    const read = vi
      .fn<BrunchFlueClient["read"]>()
      .mockResolvedValue(reply("submission-empty", "incarnation-empty", ""));
    const tool = createBrunchTurnTool({
      conversationId: "persona-empty",
      client: controlledClient(send, read),
    });

    await expect(
      tool.execute("tool-call-empty-reply", { message: "Please continue" }),
    ).rejects.toThrow(/submission-empty.*without assistant text/u);
    await expect(
      tool.execute("tool-call-after-empty", { message: "Do not send this" }),
    ).rejects.toThrow(/inspect canonical Flue history/u);

    expect(send).toHaveBeenCalledOnce();
  });

  test("records server tool execution without changing the persona-visible reply", async () => {
    const admitted = admission("submission-server-tool", "incarnation-tools");
    const history = vi.fn<BrunchFlueClient["history"]>().mockResolvedValue(
      snapshot("submission-server-tool", [
        {
          type: "dynamic-tool",
          toolCallId: "tool-server-1",
          toolName: "activate_skill",
          state: "output-available",
          input: { name: "sdcpn-modelling" },
          output: { activated: true },
        },
      ]),
    );
    const tool = createBrunchTurnTool({
      conversationId: "persona-server-tool",
      client: controlledClient(
        vi.fn<BrunchFlueClient["send"]>().mockResolvedValue(admitted),
        vi
          .fn<BrunchFlueClient["read"]>()
          .mockResolvedValue(
            reply(
              "submission-server-tool",
              "incarnation-tools",
              "What happens first?",
            ),
          ),
        history,
      ),
    });

    const result = await tool.execute("tool-call-server", {
      message: "I want to describe the process.",
    });

    expect(result.content).toEqual([
      { type: "text", text: "What happens first?" },
    ]);
    expect(result.details.toolActivity).toEqual([
      {
        sequence: 1,
        submissionId: "submission-server-tool",
        toolCallId: "tool-server-1",
        toolName: "activate_skill",
        executor: "server",
        outcome: "output",
        input: { name: "sdcpn-modelling" },
        output: { activated: true },
      },
    ]);
  });

  test("services client-deferred calls with ordered mocks and resumes the exact submission", async () => {
    const firstAdmission = admission(
      "submission-client-tool",
      "incarnation-tools",
    );
    const resumeAdmission = admission(
      "submission-client-resume",
      "incarnation-tools",
    );
    const send = vi
      .fn<BrunchFlueClient["send"]>()
      .mockResolvedValueOnce(firstAdmission)
      .mockResolvedValueOnce(resumeAdmission);
    const read = vi
      .fn<BrunchFlueClient["read"]>()
      .mockResolvedValueOnce(
        reply(
          "submission-client-tool",
          "incarnation-tools",
          "I will check the guide.",
        ),
      )
      .mockResolvedValueOnce(
        reply(
          "submission-client-resume",
          "incarnation-tools",
          "Open Simulation settings first.",
        ),
      );
    const history = vi
      .fn<BrunchFlueClient["history"]>()
      .mockResolvedValueOnce(
        snapshot("submission-client-tool", [
          {
            type: "dynamic-tool",
            toolCallId: "tool-doc-1",
            toolName: "readPetrinautDoc",
            state: "output-available",
            input: { doc: "simulation" },
            output: { awaiting: AWAITING_CLIENT },
          },
        ]),
      )
      .mockResolvedValueOnce(snapshot("submission-client-resume"));
    const host = createMockClientToolHost([
      {
        toolName: "readPetrinautDoc",
        input: { doc: "simulation" },
        output: "Simulation guide fixture",
      },
    ]);
    const tool = createBrunchTurnTool({
      conversationId: "persona-client-tool",
      client: controlledClient(send, read, history),
      resolveClientToolHost: () => host,
    });

    const result = await tool.execute("tool-call-client", {
      message: "How do I run a simulation?",
    });

    expect(send).toHaveBeenNthCalledWith(2, {
      message: {
        kind: "signal",
        type: CLIENT_TOOL_RESULT_SIGNAL,
        tagName: CLIENT_TOOL_RESULT_SIGNAL,
        body: JSON.stringify([
          {
            toolCallId: "tool-doc-1",
            toolName: "readPetrinautDoc",
            output: "Simulation guide fixture",
          },
        ]),
        attributes: { toolCallIds: "tool-doc-1" },
      },
      uid: "incarnation-tools",
      signal: undefined,
    });
    expect(read).toHaveBeenNthCalledWith(1, firstAdmission, {
      signal: undefined,
    });
    expect(read).toHaveBeenNthCalledWith(2, resumeAdmission, {
      signal: undefined,
    });
    expect(result).toEqual({
      content: [{ type: "text", text: "Open Simulation settings first." }],
      details: {
        conversationId: "persona-client-tool",
        submissionId: "submission-client-resume",
        submissionIds: ["submission-client-tool", "submission-client-resume"],
        status: "elicitor-replied",
        elicitorText: "Open Simulation settings first.",
        toolActivity: [
          {
            sequence: 1,
            submissionId: "submission-client-tool",
            toolCallId: "tool-doc-1",
            toolName: "readPetrinautDoc",
            executor: "mock",
            outcome: "output",
            input: { doc: "simulation" },
            output: "Simulation guide fixture",
          },
        ],
      },
    });

    const rendered = tool
      .renderResult(result, { isPartial: false }, renderTheme, {
        isError: false,
      })
      .render(80)
      .join("\n");
    expect(rendered).toContain("Tool activity");
    expect(rendered).toContain("readPetrinautDoc");
    expect(rendered).toContain("mock; output");
  });

  test("fails closed on a mock mismatch and blocks later user sends", async () => {
    const admitted = admission("submission-mock-mismatch", "incarnation-tools");
    const send = vi.fn<BrunchFlueClient["send"]>().mockResolvedValue(admitted);
    const tool = createBrunchTurnTool({
      conversationId: "persona-mock-mismatch",
      client: controlledClient(
        send,
        vi
          .fn<BrunchFlueClient["read"]>()
          .mockResolvedValue(
            reply("submission-mock-mismatch", "incarnation-tools", ""),
          ),
        vi.fn<BrunchFlueClient["history"]>().mockResolvedValue(
          snapshot("submission-mock-mismatch", [
            {
              type: "dynamic-tool",
              toolCallId: "tool-doc-mismatch",
              toolName: "readPetrinautDoc",
              state: "output-available",
              input: { doc: "simulation" },
              output: { awaiting: AWAITING_CLIENT },
            },
          ]),
        ),
      ),
      resolveClientToolHost: () =>
        createMockClientToolHost([
          {
            toolName: "readPetrinautDoc",
            input: { doc: "scenarios" },
            output: "Wrong fixture",
          },
        ]),
    });

    await expect(
      tool.execute("tool-call-mismatch", { message: "Check simulation" }),
    ).rejects.toThrow(/mock client-tool host failed.*mismatch/iu);
    await expect(
      tool.execute("tool-call-after-mismatch", { message: "Do not send" }),
    ).rejects.toThrow(/inspect canonical Flue history/u);
    expect(send).toHaveBeenCalledOnce();
  });

  test("executes real Petrinaut docs and construction callbacks headlessly", async () => {
    const host = createRealHeadlessClientToolHost("Persona tool proof");
    try {
      const guide = await host.execute({
        submissionId: "submission-doc",
        toolCallId: "tool-doc-real",
        toolName: "readPetrinautDoc",
        input: { doc: "simulation" },
      });
      const mutation = await host.execute({
        submissionId: "submission-place",
        toolCallId: "tool-place-real",
        toolName: "addPlace",
        input: {
          id: "line_idle",
          name: "LineIdle",
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      });

      expect(guide).toEqual(expect.stringContaining("# Simulation"));
      expect(guide).not.toEqual(expect.stringContaining("<img"));
      expect(mutation).toEqual({ applied: true });
    } finally {
      await host.dispose?.();
    }
  });

  test("reports admission progress with the submission id", async () => {
    const admitted = admission("submission-progress", "incarnation-progress");
    const onUpdate =
      vi.fn<NonNullable<Parameters<BrunchTurnTool["execute"]>[3]>>();
    const tool: BrunchTurnTool = createBrunchTurnTool({
      conversationId: "persona-progress",
      client: controlledClient(
        vi.fn<BrunchFlueClient["send"]>().mockResolvedValue(admitted),
        vi
          .fn<BrunchFlueClient["read"]>()
          .mockResolvedValue(
            reply("submission-progress", "incarnation-progress", "Observed"),
          ),
      ),
    });

    await tool.execute(
      "tool-call-progress",
      { message: "Show progress" },
      undefined,
      onUpdate,
    );

    expect(onUpdate).toHaveBeenCalledWith({
      content: [
        {
          type: "text",
          text: "Waiting for elicitor submission submission-progress",
        },
      ],
      details: {
        conversationId: "persona-progress",
        submissionId: "submission-progress",
        status: "waiting-for-elicitor",
      },
    });
  });

  test("renders the two sides of a turn as width-bounded Markdown", () => {
    const tool = createBrunchTurnTool({
      conversationId: "persona-render",
      client: controlledClient(vi.fn(), vi.fn()),
    });
    const callComponent = tool.renderCall(
      { message: "A persona message that exceeds the narrow pane width." },
      renderTheme,
    );
    const resultComponent = tool.renderResult(
      {
        content: [{ type: "text", text: "The elicitor's reply." }],
        details: {
          conversationId: "persona-render",
          submissionId: "submission-render",
          submissionIds: ["submission-render"],
          status: "elicitor-replied",
          elicitorText: "The elicitor's reply.",
          toolActivity: [],
        },
      },
      { isPartial: false },
      renderTheme,
      { isError: false },
    );

    const callLines = callComponent.render(12);
    const resultLines = resultComponent.render(12);

    expect(callLines.map((line) => line.trimEnd())).toEqual([
      "User",
      "",
      "A persona",
      "message that",
      "exceeds the",
      "narrow pane",
      "width.",
    ]);
    expect(resultLines.map((line) => line.trimEnd())).toEqual([
      "Brunch",
      "",
      "The",
      "elicitor's",
      "reply.",
    ]);
    expect(
      [...callLines, ...resultLines].every((line) => line.length <= 12),
    ).toBe(true);
  });
});
