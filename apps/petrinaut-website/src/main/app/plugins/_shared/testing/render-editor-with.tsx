import { cleanup, render, waitFor } from "@testing-library/react";
import { beforeAll, expect, vi } from "vitest";

import { createJsonDocHandle } from "@hashintel/petrinaut-core";
import { Petrinaut, type PetrinautProps } from "@hashintel/petrinaut/ui";
import { type PetrinautPlugin } from "@hashintel/petrinaut/ui/plugin";

import {
  InProcessLspWorker,
  NoopResizeObserver,
} from "../../../shared/petrinaut-jsdom";

/** Renders the real editor on an empty net with `plugins` installed, and returns its handle too. */
export const renderEditorWith = (
  plugins: readonly PetrinautPlugin[],
  props?: Omit<PetrinautProps, "handle" | "instance" | "plugins">,
) => {
  // Kept until the environment is disposed: the language server starts lazily.
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  vi.stubGlobal("Worker", InProcessLspWorker);
  const handle = createJsonDocHandle({
    initial: { places: [], transitions: [] },
  });

  return {
    ...render(<Petrinaut {...props} handle={handle} plugins={plugins} />),
    handle,
  };
};

// The first mount starts loading the editor's bundled Monaco, which in a
// parallel run outlasts the one-second waits of the test that mounted it. The
// editor assigns `MonacoEnvironment.getWorker` once that load has finished.
beforeAll(async () => {
  renderEditorWith([]);
  await waitFor(
    () =>
      expect(
        typeof (globalThis as { MonacoEnvironment?: { getWorker?: unknown } })
          .MonacoEnvironment?.getWorker,
        "the editor should finish loading Monaco",
      ).toBe("function"),
    { timeout: 30_000 },
  );
  cleanup();
}, 30_000);
