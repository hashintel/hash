// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { WordsConfigurer } from "./words-configurer";

afterEach(cleanup);

test("Voice assistant words are added from the list without a transcript teaching action", async () => {
  const save =
    vi.fn<(entries: readonly { id: string; spelling: string }[]) => void>();
  render(
    <WordsConfigurer
      entries={[]}
      notice={null}
      ready
      save={save}
      onClose={vi.fn()}
    />,
  );
  expect(
    await screen.findByRole("dialog", { name: "Words for Voice assistant" }),
  ).toBeDefined();
  expect(screen.queryByText(/Teach this word/u)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Add word" }));
  const spelling = await screen.findByRole("textbox", {
    name: "Correct spelling",
  });
  expect((spelling as HTMLInputElement).value).toBe("");
  fireEvent.change(spelling, { target: { value: "RelayDesk" } });
  fireEvent.click(screen.getByRole("button", { name: "Save word" }));
  expect(save).toHaveBeenCalledOnce();
  expect(save.mock.calls[0]?.[0].map((entry) => entry.spelling)).toEqual([
    "RelayDesk",
  ]);
  expect(save.mock.calls[0]?.[0][0]?.id).toEqual(expect.any(String));
  expect(screen.getByRole("status").textContent).toContain("Restart Voice");
});

test("allows the 50th word and disables Add at the limit", async () => {
  const entries = Array.from({ length: 50 }, (_, index) => ({
    id: `word-${index}`,
    spelling: `Bay ${index}`,
  }));
  const props = { notice: null, ready: true, save: vi.fn(), onClose: vi.fn() };
  const view = render(
    <WordsConfigurer {...props} entries={entries.slice(0, 49)} />,
  );
  const addButton = (await screen.findByRole("button", {
    name: "Add word",
  })) as HTMLButtonElement;
  expect(addButton.disabled).toBe(false);
  expect(screen.getByText("49 of 50 words")).toBeDefined();

  view.rerender(<WordsConfigurer {...props} entries={entries} />);
  expect(addButton.disabled).toBe(true);
  expect(screen.getByText("50 of 50 words")).toBeDefined();
});
