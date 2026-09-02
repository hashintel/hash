import {
  FlueExecutionError,
  type AgentReadResult,
  type AgentSendResult,
  type FlueClient,
} from "@flue/sdk";
import { describe, expect, test, vi } from "vitest";

import {
  createBrunchTurnTool,
  registerBrunchTurn,
  type BrunchTurnExtensionApi,
  type BrunchTurnTool,
} from "../../../libs/@hashintel/brunch-agent/.pi/extensions/brunch-turn.ts";

type BrunchFlueClient = Pick<FlueClient, "read" | "send">;

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

const controlledClient = (
  send: BrunchFlueClient["send"],
  read: BrunchFlueClient["read"],
): BrunchFlueClient => ({ send, read });

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
        status: "elicitor-replied",
        elicitorText: "First elicitor reply",
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

  test("keeps custom TUI rendering within the supplied width", () => {
    const tool = createBrunchTurnTool({
      conversationId: "persona-render",
      client: controlledClient(vi.fn(), vi.fn()),
    });
    const component = tool.renderCall(
      { message: "A persona message that exceeds the narrow pane width." },
      {
        bold: (text) => text,
        fg: (_color, text) => text,
      },
    );

    expect(component.render(12).every((line) => line.length <= 12)).toBe(true);
  });
});
