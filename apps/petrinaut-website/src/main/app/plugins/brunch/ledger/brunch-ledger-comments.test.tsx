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

import { pendingCommentsFor } from "./brunch-ledger-comments";
import { BrunchLedgerCommentsBar } from "./brunch-ledger-comments-bar";

import type { PetrinautAiComposerControlContext } from "../chat/ai-assistant-composer-control";

afterEach(cleanup);

const onCrew = { records: ["e1"], text: "There are two crews." };
const admitted = { kind: "message", messageId: "comments" } as const;

test("numbers comments after those already sent, and never reuses a number", () => {
  const comments = pendingCommentsFor({});
  expect(comments.add(onCrew, ["n1", "n4"]).id).toBe("n5");
  comments.discard();
  expect(comments.add(onCrew, ["n1", "n4"]).id).toBe("n6");
});

test("sends every pending comment as one turn, keeping comments added meanwhile", async () => {
  const comments = pendingCommentsFor({});
  comments.add(onCrew, []);
  let settle = () => {};
  const submitText = vi.fn<PetrinautAiComposerControlContext["submitText"]>(
    () =>
      new Promise((resolve) => {
        settle = () => resolve(admitted);
      }),
  );
  comments.send(submitText);
  comments.send(submitText);
  comments.add({ records: ["c1"], text: "Only in winter." }, []);

  expect(submitText).toHaveBeenCalledOnce();
  const request = submitText.mock.calls[0]?.[0];
  expect(request?.target).toBe("message");
  expect(request?.preserveDraft).toBe(true);
  expect(parseLedgerComments(request?.text ?? "")).toEqual([
    { id: "n1", ...onCrew },
  ]);
  expect(comments.get().sending).toBe("pending");

  settle();
  await vi.waitFor(() => expect(comments.get().sending).toBe("idle"));
  expect(comments.get().comments.map(({ id }) => id)).toEqual(["n2"]);
});

test("keeps comments that could not be sent", async () => {
  const comments = pendingCommentsFor({});
  comments.add(onCrew, []);
  comments.send(() => Promise.reject(new Error("offline")));
  await vi.waitFor(() => expect(comments.get().sending).toBe("failed"));
  expect(comments.get().comments).toHaveLength(1);
});

test("the composer bar sends or discards the pending comments, and is absent without any", async () => {
  const net = createPetrinaut({
    document: createJsonDocHandle({
      initial: { places: [], transitions: [] },
    }),
  }).definition;
  const submitText = vi.fn<PetrinautAiComposerControlContext["submitText"]>(
    () => Promise.resolve(admitted),
  );
  const context: PetrinautAiComposerControlContext = {
    conversationId: "conversation",
    messages: [],
    status: "ready",
    submitText,
    stop: async () => {},
  };
  const { container } = render(
    <BrunchLedgerCommentsBar context={context} net={net} />,
  );
  expect(container.textContent).toBe("");

  const comments = pendingCommentsFor(net);
  act(() => {
    comments.add(onCrew, []);
    comments.add({ records: ["c1"], text: "Only in winter." }, []);
  });
  expect(
    screen.getByRole("group", { name: "Ledger comments" }).textContent,
  ).toContain("2 comments on the Ledger");

  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  expect(submitText).toHaveBeenCalledOnce();
  await waitFor(() =>
    expect(screen.queryByRole("group", { name: "Ledger comments" })).toBeNull(),
  );

  act(() => {
    comments.add({ records: ["c2"], text: "Ask the planner." }, []);
  });
  fireEvent.click(screen.getByRole("button", { name: "Discard" }));
  expect(comments.get().comments).toEqual([]);
});
