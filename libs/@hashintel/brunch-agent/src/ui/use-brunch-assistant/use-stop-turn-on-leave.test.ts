/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import { BrunchPanelConversationTracker } from "../../client/brunch-panel-transport";
import { useStopTurnOnLeave } from "./use-stop-turn-on-leave";

import type { FlueClient, FlueConversationState } from "@flue/sdk";

const session = () => {
  const abort = vi.fn<FlueClient["abort"]>(async () => ({ aborted: true }));
  return {
    abort,
    client: Promise.resolve({ abort } as unknown as FlueClient),
    tracker: new BrunchPanelConversationTracker(),
  };
};

const admit = (tracker: BrunchPanelConversationTracker, submissionId: string) =>
  tracker.recordAdmission({
    kind: "user",
    messageId: `message-${submissionId}`,
    admission: {
      submissionId,
      uid: "uid",
      offset: "offset",
      streamUrl: "http://brunch.test/stream",
    },
  });

/** A history snapshot with settlements for exactly `settled`. */
const snapshotSettling = (
  ...settled: readonly string[]
): FlueConversationState =>
  ({
    conversationId: "conversation",
    messages: [],
    settlements: settled.map((submissionId) => ({
      submissionId,
      outcome: "completed",
    })),
  }) as unknown as FlueConversationState;

type Props = {
  editorHandle: unknown;
  binding: unknown;
  sent: ReturnType<typeof session>;
  snapshot: FlueConversationState | undefined;
};

const renderLeaving = (initialProps: Props) => {
  const onError = vi.fn();
  const hook = renderHook(
    ({ editorHandle, binding, sent, snapshot }: Props) =>
      useStopTurnOnLeave({
        editorHandle,
        binding,
        session: { client: sent.client, tracker: sent.tracker, snapshot },
        onError,
      }),
    { initialProps },
  );
  return { ...hook, onError };
};

const binding = { conversationId: "conversation", documentId: "net" };

test("replacing the editor stops this tab's running turn once, with the session that sent it", async () => {
  const sent = session();
  admit(sent.tracker, "this-tab");
  const props = {
    editorHandle: "handle-1",
    binding,
    sent,
    snapshot: snapshotSettling(),
  };
  const { rerender } = renderLeaving(props);

  rerender({ ...props, editorHandle: "handle-2" });
  await vi.waitFor(() => expect(sent.abort).toHaveBeenCalledOnce());
  rerender({ ...props, editorHandle: "handle-2" });
  // Once the history shows the stop's settlement, leaving again stops nothing.
  rerender({
    ...props,
    editorHandle: "handle-2",
    snapshot: snapshotSettling("this-tab"),
  });
  rerender({
    ...props,
    editorHandle: "handle-3",
    snapshot: snapshotSettling("this-tab"),
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(sent.abort).toHaveBeenCalledOnce();
});

test("a settled turn here is not stopped while another tab's turn on the conversation runs", async () => {
  const sent = session();
  admit(sent.tracker, "this-tab");
  // The other tab's submission has no settlement, and this tracker never admitted it.
  const props = {
    editorHandle: "handle-1",
    binding,
    sent,
    snapshot: snapshotSettling("this-tab"),
  };
  const { rerender, unmount } = renderLeaving(props);

  rerender({ ...props, editorHandle: "handle-2" });
  unmount();
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(sent.abort).not.toHaveBeenCalled();
});

test("without a history snapshot an admitted turn doesn't count as unsettled", async () => {
  const sent = session();
  admit(sent.tracker, "this-tab");
  const props = {
    editorHandle: "handle-1",
    binding,
    sent,
    snapshot: undefined,
  };
  const { rerender } = renderLeaving(props);

  rerender({ ...props, editorHandle: "handle-2" });
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(sent.abort).not.toHaveBeenCalled();
});

test("a submission still awaiting admission is stopped once it is admitted", async () => {
  const sent = session();
  let admitted = () => {};
  void sent.tracker.trackSubmission(
    new Promise<void>((resolve) => {
      admitted = resolve;
    }),
  );
  const props = {
    editorHandle: "handle-1",
    binding,
    sent,
    snapshot: undefined,
  };
  const { rerender } = renderLeaving(props);

  rerender({ ...props, editorHandle: "handle-2" });
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(sent.abort).not.toHaveBeenCalled();
  admitted();
  await vi.waitFor(() => expect(sent.abort).toHaveBeenCalledOnce());
});

test("a changed binding or an unmount stops the leaving session's turn, not the next one's", async () => {
  const first = session();
  admit(first.tracker, "first");
  const next = session();
  const props = {
    editorHandle: "handle-1",
    binding,
    sent: first,
    snapshot: snapshotSettling(),
  };
  const { rerender, unmount } = renderLeaving(props);

  rerender({
    ...props,
    binding: { ...binding, documentId: "other-net" },
    sent: next,
  });
  await vi.waitFor(() => expect(first.abort).toHaveBeenCalledOnce());
  expect(next.abort).not.toHaveBeenCalled();

  admit(next.tracker, "next");
  unmount();
  await vi.waitFor(() => expect(next.abort).toHaveBeenCalledOnce());
  expect(first.abort).toHaveBeenCalledOnce();
});

test("a session recreated for the same editor and binding is not a leave", async () => {
  const before = session();
  admit(before.tracker, "running");
  const after = session();
  const props = {
    editorHandle: "handle-1",
    binding,
    sent: before,
    snapshot: snapshotSettling(),
  };
  const { rerender } = renderLeaving(props);

  // As when the host passes a new `fetch`, owner key or chat endpoint.
  rerender({ ...props, sent: after });
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(before.abort).not.toHaveBeenCalled();
  expect(after.abort).not.toHaveBeenCalled();
});

test("a failed stop is reported", async () => {
  const sent = session();
  const failure = new Error("offline");
  sent.abort.mockRejectedValueOnce(failure);
  admit(sent.tracker, "this-tab");
  const props = {
    editorHandle: "handle-1",
    binding,
    sent,
    snapshot: snapshotSettling(),
  };
  const { rerender, onError } = renderLeaving(props);

  rerender({ ...props, editorHandle: "handle-2" });
  await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(failure));
});
