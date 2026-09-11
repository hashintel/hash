/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { sirModel } from "@hashintel/petrinaut-core/examples";

import { ShareSnapshotButton } from "./share-snapshot-button";
import { SnapshotError } from "./snapshot";
import { prepareSnapshot } from "./snapshot-client";

vi.mock("./snapshot-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./snapshot-client")>()),
  prepareSnapshot: vi.fn(),
}));

const writeText = vi.fn().mockResolvedValue(undefined);
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  vi.mocked(prepareSnapshot).mockResolvedValue("v1.br.encoded");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const open = () => {
  const snapshot = {
    title: "SIR",
    definition: structuredClone(sirModel.petriNetDefinition),
  };
  render(
    <ShareSnapshotButton
      getSnapshot={() => snapshot}
      search={{ mode: "simulate", view: "scenarios" }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Share" }));
  return snapshot;
};

test("captures a snapshot and copies its link with an optional current view", async () => {
  const original = open();
  original.title = "Changed later";
  const input = await screen.findByRole("textbox", { name: "Snapshot link" });
  expect(vi.mocked(prepareSnapshot).mock.calls[0]?.[0].title).toBe("SIR");
  expect(input.getAttribute("value")).toContain("mode=simulate");
  fireEvent.click(screen.getByRole("button", { name: "Copy snapshot link" }));
  await screen.findByText("Link copied.");
  expect(writeText).toHaveBeenLastCalledWith(
    expect.stringContaining("mode=simulate"),
  );
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Include current view" }),
  );
  await waitFor(() => expect(input.getAttribute("value")).not.toContain("?"));
  fireEvent.click(screen.getByRole("button", { name: "Copy snapshot link" }));
  await waitFor(() =>
    expect(writeText).toHaveBeenLastCalledWith(
      `${window.location.origin}/share#v1.br.encoded`,
    ),
  );
  expect(prepareSnapshot).toHaveBeenCalledTimes(1);
});

test("offers a file instead of a copyable link when compression exceeds the limit", async () => {
  vi.mocked(prepareSnapshot).mockRejectedValue(new SnapshotError("too-large"));
  open();
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "This snapshot is too large for a link. Share the downloaded file instead.",
  );
  expect(
    screen.getByRole("button", { name: "Copy snapshot link" }),
  ).toHaveProperty("disabled", true);
  expect(screen.getByRole("button", { name: "Download file" })).toHaveProperty(
    "disabled",
    false,
  );
});

test("retains a selectable link when clipboard access fails", async () => {
  writeText.mockRejectedValueOnce(new Error("Clipboard denied"));
  open();
  await screen.findByRole("textbox", { name: "Snapshot link" });
  fireEvent.click(screen.getByRole("button", { name: "Copy snapshot link" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Couldn't copy the link. Select it above and copy it manually.",
  );
  expect(screen.getByRole("textbox", { name: "Snapshot link" })).toHaveProperty(
    "readOnly",
    true,
  );
});

test("cancels preparation when the dialog unmounts", async () => {
  vi.mocked(prepareSnapshot).mockImplementation(() => new Promise(() => {}));
  open();
  await screen.findByText("Preparing your link…");
  const signal = vi.mocked(prepareSnapshot).mock.calls[0]?.[1];
  cleanup();
  expect(signal?.aborted).toBe(true);
});
