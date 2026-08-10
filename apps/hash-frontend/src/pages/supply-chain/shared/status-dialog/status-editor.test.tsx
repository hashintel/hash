// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { StatusEditor } from "./status-editor";

import type { EntityId } from "@blockprotocol/type-system";
import type { TextToken } from "@local/hash-isomorphic-utils/types";

const mentionedUserEntityId =
  "00000000-0000-0000-0000-000000000001~00000000-0000-0000-0000-000000000002" as EntityId;
const scrollIntoView = vi.fn();

afterEach(cleanup);
beforeAll(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    disconnect() {}

    observe() {}

    unobserve() {}
  } as unknown as typeof ResizeObserver;
  HTMLElement.prototype.scrollIntoView = scrollIntoView;
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () =>
    ({
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) satisfies DOMRect;
});

describe("StatusEditor", () => {
  it("renders atomic mentions and emits multiline token content", async () => {
    const onChange = vi.fn<(tokens: TextToken[]) => void>();
    render(
      <StatusEditor
        members={[
          {
            displayName: "Alex Rivera",
            entityId: mentionedUserEntityId,
            shortname: "arivera",
          },
        ]}
        onChange={onChange}
        placeholder="Add an update"
        value={[
          {
            tokenType: "mention",
            mentionType: "user",
            entityId: mentionedUserEntityId,
          },
        ]}
      />,
    );

    expect(
      screen.getByText("@arivera").classList.contains("status-mention"),
    ).toBe(true);

    const textbox = await screen.findByRole("textbox", {
      name: "Status comment",
    });
    fireEvent.keyDown(textbox, { key: "Enter" });

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(
        expect.arrayContaining([
          { tokenType: "hardBreak" },
          expect.objectContaining({
            tokenType: "mention",
            mentionType: "user",
            entityId: mentionedUserEntityId,
          }),
        ]),
      ),
    );
  });

  it("keeps a visible text cursor after inserting a mention", async () => {
    const onChange = vi.fn<(tokens: TextToken[]) => void>();
    render(
      <StatusEditor
        members={[
          {
            displayName: "Alex Rivera",
            entityId: mentionedUserEntityId,
            shortname: "arivera",
          },
        ]}
        onChange={onChange}
        placeholder="Add an update"
        value={[]}
      />,
    );

    const textbox = await screen.findByRole("textbox", {
      name: "Status comment",
    });
    textbox.focus();
    textbox.textContent = "@a";
    const range = document.createRange();
    range.selectNodeContents(textbox);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    fireEvent.input(textbox, { data: "@a", inputType: "insertText" });

    const suggestion = await screen.findByRole("option", {
      name: /Alex Rivera/,
    });
    fireEvent.click(suggestion);

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith([
        expect.objectContaining({
          tokenType: "mention",
          mentionType: "user",
          entityId: mentionedUserEntityId,
        }),
        { tokenType: "text", text: " " },
      ]),
    );
    expect(document.activeElement).toBe(textbox);
    expect(textbox.textContent.endsWith(" ")).toBe(true);
  });

  it("selects the active mention suggestion with Tab", async () => {
    const onChange = vi.fn<(tokens: TextToken[]) => void>();
    render(
      <StatusEditor
        members={[
          {
            displayName: "Alex Rivera",
            entityId: mentionedUserEntityId,
            shortname: "arivera",
          },
        ]}
        onChange={onChange}
        placeholder="Add an update"
        value={[]}
      />,
    );

    const textbox = await screen.findByRole("textbox", {
      name: "Status comment",
    });
    textbox.focus();
    textbox.textContent = "@a";
    const range = document.createRange();
    range.selectNodeContents(textbox);
    range.collapse(false);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    fireEvent.input(textbox, { data: "@a", inputType: "insertText" });

    const suggestion = await screen.findByRole("option", {
      name: /Alex Rivera/,
    });
    expect(textbox.getAttribute("aria-autocomplete")).toBe("list");
    expect(textbox.getAttribute("aria-expanded")).toBe("true");
    expect(textbox.getAttribute("aria-controls")).toBe(
      suggestion.parentElement?.parentElement?.id,
    );
    expect(textbox.getAttribute("aria-activedescendant")).toBe(suggestion.id);
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
    });
    fireEvent.keyDown(textbox, { key: "Tab" });

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith([
        expect.objectContaining({
          tokenType: "mention",
          mentionType: "user",
          entityId: mentionedUserEntityId,
        }),
        { tokenType: "text", text: " " },
      ]),
    );
    expect(document.activeElement).toBe(textbox);
  });
});
