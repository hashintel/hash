/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  screen,
  waitForElementToBeRemoved,
  within,
} from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { renderEditorWith } from "../_shared/testing/render-editor-with";
import { commandPalettePlugin } from "./plugin";

await vi.hoisted(async () => {
  const { installPetrinautDomShims } =
    await import("../../shared/petrinaut-jsdom");
  installPetrinautDomShims();
});

afterEach(cleanup);

test.each(["metaKey", "ctrlKey"])(
  "%s + K opens the palette inside the editor, over the editor's commands; with Shift it does not",
  async (modifier) => {
    renderEditorWith(commandPalettePlugin);
    await screen.findByRole("button", { name: "Command palette" });

    fireEvent.keyDown(document.body, {
      key: "K",
      [modifier]: true,
      shiftKey: true,
    });
    expect(
      screen.queryByRole("dialog", { name: "Command palette" }),
    ).toBeNull();

    fireEvent.keyDown(document.body, { key: "k", [modifier]: true });
    const palette = screen.getByRole("dialog", { name: "Command palette" });
    expect(within(palette).getByText("Switch to the Select tool")).toBeTruthy();
    expect(
      within(palette).getByText("Toggle the command palette"),
    ).toBeTruthy();
  },
);

test("the top-bar button opens the palette and its own toggle row closes it", async () => {
  renderEditorWith(commandPalettePlugin);

  fireEvent.click(
    await screen.findByRole("button", { name: "Command palette" }),
  );
  const palette = screen.getByRole("dialog", { name: "Command palette" });

  fireEvent.click(within(palette).getByText("Toggle the command palette"));
  await waitForElementToBeRemoved(palette);
});
