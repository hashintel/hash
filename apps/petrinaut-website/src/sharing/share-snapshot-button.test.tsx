/** @vitest-environment jsdom */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { serializeSDCPN } from "@hashintel/petrinaut-core";
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
  vi.restoreAllMocks();
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
  const createObjectURL = vi
    .fn<(blob: Blob) => string>()
    .mockReturnValue("blob:snapshot");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = createObjectURL;
      static revokeObjectURL = revokeObjectURL;
    },
  );
  const download = vi
    .spyOn(HTMLAnchorElement.prototype, "click")
    .mockImplementation(() => {});
  const captured = structuredClone(open());
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "This snapshot is too large for a link. Share the downloaded file instead.",
  );
  expect(
    screen.getByRole("button", { name: "Copy snapshot link" }),
  ).toHaveProperty("disabled", true);
  fireEvent.click(screen.getByRole("button", { name: "Download file" }));
  expect(download).toHaveBeenCalledOnce();
  expect(download.mock.instances[0]).toHaveProperty("download", "SIR.yaml");
  expect(download.mock.instances[0]).toHaveProperty("href", "blob:snapshot");
  const blob = createObjectURL.mock.calls[0]?.[0];
  expect(blob).toBeInstanceOf(Blob);
  if (!blob) throw new Error("The snapshot download was not created");
  expect(blob.type).toBe("application/yaml");
  const content = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("The snapshot file could not be read as text"));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
  expect(content).toBe(
    serializeSDCPN({
      title: captured.title,
      petriNetDefinition: captured.definition,
    }),
  );
  await waitFor(() =>
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:snapshot"),
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

test("keeps the copied URL stable while clipboard access is pending", async () => {
  let finishCopy: () => void = () => {};
  writeText.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishCopy = resolve;
      }),
  );
  open();
  const input = await screen.findByRole("textbox", { name: "Snapshot link" });
  const originalUrl = input.getAttribute("value");
  fireEvent.click(screen.getByRole("button", { name: "Copy snapshot link" }));
  const checkbox = screen.getByRole("checkbox", {
    name: "Include current view",
  });
  expect(checkbox).toHaveProperty("disabled", true);
  const copying = screen.getByRole("button", { name: "Copying…" });
  expect(copying).toHaveProperty("disabled", true);
  fireEvent.click(copying);
  expect(writeText).toHaveBeenCalledOnce();
  expect(writeText).toHaveBeenCalledWith(originalUrl);
  await act(async () => finishCopy());
  expect(await screen.findByText("Link copied.")).toBeTruthy();
  expect(checkbox).toHaveProperty("disabled", false);
  fireEvent.click(checkbox);
  await waitFor(() => expect(input.getAttribute("value")).not.toContain("?"));
  expect(screen.queryByText("Link copied.")).toBeNull();
});
