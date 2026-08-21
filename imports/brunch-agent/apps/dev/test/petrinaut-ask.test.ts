import { expect, test } from "bun:test";
import { join } from "node:path";

type StreamChunk = Record<string, unknown> & { readonly type: string };

test("a structured ask suspends over the wire and its correlated submission resumes the conversation", async () => {
  const child = Bun.spawn({
    cmd: [
      Bun.which("node") ?? "node",
      "--experimental-strip-types",
      join(import.meta.dir, "petrinaut-ask.integration.ts"),
    ],
    cwd: join(import.meta.dir, "../../.."),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);

  expect(exitCode, stderr || stdout).toBe(0);
  const resultLine = stdout.split("\n").find((line) => line.startsWith("PETRINAUT_ASK_RESULT "));
  expect(resultLine, stdout).toBeDefined();
  const result = JSON.parse(resultLine!.slice("PETRINAUT_ASK_RESULT ".length)) as {
    initialStatus: number;
    askCall: StreamChunk | undefined;
    initialToolOutputs: StreamChunk[];
    initialFinish: StreamChunk;
    resumedStatus: number;
    resumedText: string;
    resumedFinish: StreamChunk;
    duplicateStatus: number;
    duplicateBody: unknown;
  };

  // Suspension: the ask leaves the server as an awaiting client tool with a
  // stable call id; the harness's minted affordance never reaches the wire.
  expect(result.initialStatus).toBe(200);
  expect(result.askCall).toMatchObject({
    type: "tool-input-available",
    toolName: "brunch_ask",
    input: { question: "What outcome should this process reliably produce?" },
  });
  expect(typeof result.askCall?.toolCallId).toBe("string");
  expect(result.initialToolOutputs).toEqual([]);
  expect(result.initialFinish).toMatchObject({ type: "finish" });

  // Resumption: the correlated submission becomes the user-affordance reply
  // and the same conversation produces the next visible turn.
  expect(result.resumedStatus).toBe(200);
  // The response carries the answer turn and then the settlement-check turn,
  // exactly as the FE-1436 application golden streams its second step.
  expect(result.resumedText).toStartWith("Payment settled — who initiates the checkout?");
  expect(result.resumedFinish).toEqual({
    type: "finish",
    finishReason: "stop",
  });

  // Provenance: replaying the same submission finds no pending ask and is
  // refused at the wire boundary, before any dispatch.
  expect(result.duplicateStatus).toBe(409);
  expect(result.duplicateBody).toEqual({ error: "ask_not_pending" });

  const inspections = stdout
    .split("\n")
    .filter((line) => line.startsWith("TRANSPORT_AISDK "))
    .map((line) => JSON.parse(line.slice("TRANSPORT_AISDK ".length)) as StreamChunk);
  expect(inspections.some((event) => event.type === "ask-await")).toBe(true);
  expect(inspections.some((event) => event.type === "ask-reply-admitted")).toBe(true);
  expect(inspections.filter((event) => event.type === "ask-reply-refused")).toEqual([
    {
      type: "ask-reply-refused",
      requestId: "request-fe1449-duplicate",
      conversationId: "conversation-fe1449-ask",
      toolCallId: result.askCall?.toolCallId,
      reason: "no-pending-ask",
    },
  ]);
});
