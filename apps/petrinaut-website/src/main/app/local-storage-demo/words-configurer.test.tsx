// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import {
  conversationWordsKey,
  useConversationWords,
} from "./conversation-words";
import { WordsConfigurer } from "./words-configurer";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

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
    await screen.findByRole("dialog", { name: "Custom words" }),
  ).toBeDefined();
  expect(
    screen.getByText("Help recognize and pronounce names and terms."),
  ).toBeDefined();
  expect(screen.queryByText(/Teach this word/u)).toBeNull();
  expect(screen.queryByText(/Brunch/u)).toBeNull();
  expect(screen.queryByRole("list")).toBeNull();
  expect(
    screen.getByText(
      "Restart Voice to apply changes. Words are saved in this browser and cleared with this conversation.",
    ),
  ).toBeDefined();
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
  expect(screen.getByRole("status").textContent).toBe("Saved.");
});

test.each(["edited", "other"])(
  "saving an edit after another tab removes %s checks the edited word still exists",
  async (removedId) => {
    const key = conversationWordsKey("person", "one");
    const entries = [
      { id: "edited", spelling: "RelayDesk", pronunciation: "relay desk" },
      { id: "other", spelling: "SDCPN" },
    ];
    localStorage.setItem(key, JSON.stringify({ version: 1, entries }));
    const Configurer = () => {
      const words = useConversationWords("person", "one");
      return (
        <WordsConfigurer
          entries={words.entries}
          ready={words.ready}
          notice={words.notice}
          save={words.save}
          onClose={vi.fn()}
        />
      );
    };
    render(<Configurer />);
    fireEvent.click(
      await screen.findByRole("button", { name: "Edit RelayDesk" }),
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Correct spelling" }),
      {
        target: { value: "RelayStation" },
      },
    );
    fireEvent.change(
      screen.getByRole("textbox", { name: "Pronunciation note (optional)" }),
      { target: { value: "relay station" } },
    );
    const remaining = entries.filter((entry) => entry.id !== removedId);
    localStorage.setItem(
      key,
      JSON.stringify({ version: 1, entries: remaining }),
    );
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", { key, storageArea: localStorage }),
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Save word" }));

    if (removedId === "edited") {
      expect(screen.getByRole("alert").textContent).toContain(
        "This word was removed. Cancel and add it again to save your changes.",
      );
      expect(screen.queryByRole("status")).toBeNull();
      expect(
        (
          screen.getByRole("textbox", {
            name: "Correct spelling",
          }) as HTMLInputElement
        ).value,
      ).toBe("RelayStation");
      expect(
        (
          screen.getByRole("textbox", {
            name: "Pronunciation note (optional)",
          }) as HTMLInputElement
        ).value,
      ).toBe("relay station");
      expect(localStorage.getItem(key)).toBe(
        JSON.stringify({ version: 1, entries: remaining }),
      );
    } else {
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.getByRole("status").textContent).toContain("Saved.");
      expect(JSON.parse(localStorage.getItem(key)!)).toEqual({
        version: 1,
        entries: [
          {
            id: "edited",
            spelling: "RelayStation",
            pronunciation: "relay station",
          },
        ],
      });
    }
  },
);

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
