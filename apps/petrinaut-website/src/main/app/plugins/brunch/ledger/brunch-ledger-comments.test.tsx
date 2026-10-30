/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { parseLedgerComments } from "@hashintel/brunch-agent";
import {
  createJsonDocHandle,
  createPetrinaut,
} from "@hashintel/petrinaut-core";
import { FlueChatAdmissionError } from "@local/flue-aisdk-transport";

import { pendingCommentsFor } from "./brunch-ledger-comments";
import { BrunchLedgerCommentsBar } from "./brunch-ledger-comments-bar";

import type { PetrinautAiComposerControlContext } from "../chat/ai-assistant-composer-control";

afterEach(cleanup);

const onCrew = { records: ["e1"], text: "There are two crews." };
const admitted = { kind: "message", messageId: "comments" } as const;

test("independent editors issue distinct comment identities without consulting shared history", () => {
  const first = pendingCommentsFor({}, "conversation");
  const second = pendingCommentsFor({}, "conversation");
  const firstId = first.add(onCrew).id;
  const secondId = second.add(onCrew).id;
  expect(firstId).not.toBe(secondId);
  first.discard();
  expect(first.add(onCrew).id).not.toBe(firstId);
});

test("pending comments belong to a conversation, not just its editor", () => {
  const net = {};
  const previous = pendingCommentsFor(net, "before-clear");
  previous.add(onCrew);
  const current = pendingCommentsFor(net, "after-clear");
  expect(current.get().comments).toEqual([]);
  expect(pendingCommentsFor(net, "before-clear")).toBe(previous);
  expect(previous.get().comments).toHaveLength(1);
});

test("sends every pending comment as one turn, keeping comments added meanwhile", async () => {
  const comments = pendingCommentsFor({}, "conversation");
  const first = comments.add(onCrew);
  let settle = () => {};
  const submitText = vi.fn<PetrinautAiComposerControlContext["submitText"]>(
    () =>
      new Promise((resolve) => {
        settle = () => resolve(admitted);
      }),
  );
  comments.send(submitText);
  comments.send(submitText);
  const later = comments.add({ records: ["c1"], text: "Only in winter." });

  expect(submitText).toHaveBeenCalledOnce();
  const request = submitText.mock.calls[0]?.[0];
  expect(request).toMatchObject({ target: "message", preserveDraft: true });
  expect(parseLedgerComments(request?.text ?? "")).toEqual([first]);
  expect(comments.get().sending).toBe("pending");

  settle();
  await vi.waitFor(() => expect(comments.get().sending).toBe("idle"));
  expect(comments.get().comments).toEqual([later]);
});

test("keeps a rejected batch editable and sends its current text on retry", async () => {
  const comments = pendingCommentsFor({}, "conversation");
  const comment = comments.add(onCrew);
  comments.send(() =>
    Promise.reject(
      new FlueChatAdmissionError({ kind: "rejected", status: 403 }),
    ),
  );
  await vi.waitFor(() => expect(comments.get().sending).toBe("failed"));
  expect(comments.get().comments).toHaveLength(1);
  comments.edit(comment.id, "  There are three crews.  ");
  const submitText = vi
    .fn<PetrinautAiComposerControlContext["submitText"]>()
    .mockResolvedValue(admitted);
  comments.send(submitText);
  expect(
    parseLedgerComments(submitText.mock.calls[0]?.[0].text ?? "")?.[0]?.text,
  ).toBe("There are three crews.");
  await vi.waitFor(() => expect(comments.get().comments).toEqual([]));
});

test("retries an uncertain admission with the same immutable batch and delivery identity", async () => {
  const comments = pendingCommentsFor({}, "conversation");
  const first = comments.add(onCrew);
  const submitText = vi
    .fn<PetrinautAiComposerControlContext["submitText"]>()
    .mockRejectedValueOnce(new FlueChatAdmissionError({ kind: "ambiguous" }))
    .mockResolvedValueOnce(admitted);
  comments.send(submitText);
  await vi.waitFor(() => expect(comments.get().sending).toBe("uncertain"));
  const later = comments.add({ records: ["c1"], text: "Another correction." });
  comments.send(submitText);
  expect(submitText.mock.calls[0]?.[0].id).toEqual(expect.any(String));
  expect(submitText.mock.calls[1]?.[0]).toEqual(submitText.mock.calls[0]?.[0]);
  expect(parseLedgerComments(submitText.mock.calls[1]?.[0].text ?? "")).toEqual(
    [first],
  );
  await vi.waitFor(() => expect(comments.get().comments).toEqual([later]));
});

test("the composer follows the new conversation after Clear chat without sending old references", async () => {
  const net = createPetrinaut({
    document: createJsonDocHandle({ initial: { places: [], transitions: [] } }),
  }).definition;
  const submitText = vi
    .fn<PetrinautAiComposerControlContext["submitText"]>()
    .mockResolvedValue(admitted);
  const context: PetrinautAiComposerControlContext = {
    conversationId: "before-clear",
    messages: [],
    status: "ready",
    submitText,
    stop: async () => {},
  };
  const { rerender } = render(
    <BrunchLedgerCommentsBar context={context} net={net} />,
  );
  const oldComments = pendingCommentsFor(net, "before-clear");
  act(() => {
    oldComments.add(onCrew);
  });
  expect(
    screen.getByRole("group", { name: "Ledger comments" }).textContent,
  ).toContain("1 comment on the Ledger");

  rerender(
    <BrunchLedgerCommentsBar
      context={{ ...context, conversationId: "after-clear" }}
      net={net}
    />,
  );
  expect(screen.queryByRole("group", { name: "Ledger comments" })).toBeNull();
  expect(submitText).not.toHaveBeenCalled();
  const newComments = pendingCommentsFor(net, "after-clear");
  let added: ReturnType<typeof newComments.add> | undefined;
  act(() => {
    added = newComments.add({
      records: ["c1"],
      text: "A correction in the new conversation.",
    });
  });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(parseLedgerComments(submitText.mock.calls[0]?.[0].text ?? "")).toEqual(
    [added],
  );
  await waitFor(() =>
    expect(screen.queryByRole("group", { name: "Ledger comments" })).toBeNull(),
  );
  expect(oldComments.get().comments).toHaveLength(1);

  act(() => {
    newComments.add(onCrew);
  });
  fireEvent.click(screen.getByRole("button", { name: "Discard" }));
  expect(newComments.get().comments).toEqual([]);
});

test("Send is unavailable for an empty in-progress comment edit", () => {
  const net = createPetrinaut({
    document: createJsonDocHandle({ initial: { places: [], transitions: [] } }),
  }).definition;
  const context: PetrinautAiComposerControlContext = {
    conversationId: "conversation",
    messages: [],
    status: "ready",
    submitText: vi.fn(),
    stop: async () => {},
  };
  const store = pendingCommentsFor(net, context.conversationId);
  const comment = store.add(onCrew);
  render(<BrunchLedgerCommentsBar context={context} net={net} />);
  act(() => {
    store.edit(comment.id, "   ");
  });
  expect(
    screen.getByRole("button", { name: "Send" }).hasAttribute("disabled"),
  ).toBe(true);
  store.send(context.submitText);
  expect(context.submitText).not.toHaveBeenCalled();
});
