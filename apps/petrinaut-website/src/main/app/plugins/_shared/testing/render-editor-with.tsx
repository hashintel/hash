import { render } from "@testing-library/react";
import { vi } from "vitest";

import { createJsonDocHandle } from "@hashintel/petrinaut-core";
import {
  Petrinaut,
  type PetrinautPlugin,
  type PetrinautProps,
} from "@hashintel/petrinaut/ui";

import {
  InProcessLspWorker,
  NoopResizeObserver,
} from "../../../shared/petrinaut-jsdom";

/** Renders the real editor on an empty net with `plugins` installed, and returns its handle too. */
export const renderEditorWith = (
  plugins: readonly PetrinautPlugin[],
  props?: Omit<PetrinautProps, "handle" | "plugins">,
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
