// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { isTeachableVoiceMessage, WordsConfigurer } from "./words-configurer";

afterEach(cleanup);

test("Teach is available only on finalized nonempty user voice captions", () => {
  const message = {
    id: "caption",
    role: "user",
    metadata: { source: "voice" },
    parts: [{ type: "text", text: "relay desk", state: "done" }],
  } as const;
  expect(
    isTeachableVoiceMessage({ ...message, parts: [...message.parts] }),
  ).toBe(true);
  expect(
    isTeachableVoiceMessage({
      ...message,
      role: "assistant",
      parts: [...message.parts],
    }),
  ).toBe(false);
  expect(
    isTeachableVoiceMessage({
      ...message,
      metadata: undefined,
      parts: [...message.parts],
    }),
  ).toBe(false);
  expect(
    isTeachableVoiceMessage({
      ...message,
      parts: [{ type: "text", text: "relay", state: "streaming" }],
    }),
  ).toBe(false);
});

test("Teach starts blank, preserves the original line and saves only a future hint", async () => {
  const save =
    vi.fn<(entries: readonly { id: string; spelling: string }[]) => void>();
  render(
    <WordsConfigurer
      entries={[]}
      notice={null}
      ready
      save={save}
      onClose={vi.fn()}
      context="They arrive in relay desk."
    />,
  );
  const spelling = await screen.findByRole("textbox", {
    name: "Correct spelling",
  });
  expect((spelling as HTMLInputElement).value).toBe("");
  expect(screen.getByText("They arrive in relay desk.")).toBeDefined();
  fireEvent.change(spelling, { target: { value: "RelayDesk" } });
  fireEvent.click(screen.getByRole("button", { name: "Save word" }));
  expect(save).toHaveBeenCalledOnce();
  expect(save.mock.calls[0]?.[0].map((entry) => entry.spelling)).toEqual([
    "RelayDesk",
  ]);
  expect(save.mock.calls[0]?.[0][0]?.id).toEqual(expect.any(String));
  expect(screen.getByRole("status").textContent).toContain("Restart Voice");
});
