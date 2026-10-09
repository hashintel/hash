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

/** Renders the real editor on an empty net with `plugin` installed. */
export const renderEditorWith = (
  plugin: PetrinautPlugin,
  props?: Omit<PetrinautProps, "handle" | "plugins">,
) => {
  // Kept until the environment is disposed: the language server starts lazily.
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  vi.stubGlobal("Worker", InProcessLspWorker);

  return render(
    <Petrinaut
      {...props}
      handle={createJsonDocHandle({ initial: { places: [], transitions: [] } })}
      plugins={[plugin]}
    />,
  );
};
