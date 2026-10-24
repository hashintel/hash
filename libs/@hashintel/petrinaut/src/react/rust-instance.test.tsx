/** @vitest-environment jsdom */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { act, cleanup, render, screen } from "@testing-library/react";
import { use } from "react";
import { afterEach, expect, test } from "vitest";

import { createRustPetrinaut } from "@hashintel/petrinaut-core/rust";

import { PetrinautDocumentProvider } from "./petrinaut-provider-layers";
import { SDCPNContext } from "./state/sdcpn-context";
import { UndoRedoContext } from "./state/undo-redo-context";

const StateView = () => {
  const { petriNetDefinition } = use(SDCPNContext);
  const history = use(UndoRedoContext);
  return (
    <>
      <output aria-label="Position">{petriNetDefinition.places[0]?.x}</output>
      <output aria-label="Can undo">{String(history?.canUndo)}</output>
    </>
  );
};

afterEach(cleanup);

test("React observes native mutations and Rust undo/redo through the document provider", async () => {
  const instance = await createRustPetrinaut({
    wasm: await readFile(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        "../../../petrinaut-core/rust/pkg/petrinaut_core_bg.wasm",
      ),
    ),
    initial: {
      places: [{ id: "p", name: "Queue", x: 0, y: 0 }],
      transitions: [],
    },
  });
  try {
    render(
      <PetrinautDocumentProvider
        instance={instance}
        netManagement={{
          title: "Rust",
          existingNets: [],
          createNewNet: () => {},
          loadPetriNet: () => {},
        }}
      >
        <StateView />
      </PetrinautDocumentProvider>,
    );
    expect(screen.getByLabelText("Position").textContent).toBe("0");
    act(() =>
      instance.mutations.updatePlacePosition({
        placeId: "p",
        position: { x: 42, y: 7 },
      }),
    );
    expect(screen.getByLabelText("Position").textContent).toBe("42");
    expect(screen.getByLabelText("Can undo").textContent).toBe("true");
    act(() => {
      instance.handle.history?.undo();
    });
    expect(screen.getByLabelText("Position").textContent).toBe("0");
    act(() => {
      instance.handle.history?.redo();
    });
    expect(screen.getByLabelText("Position").textContent).toBe("42");
  } finally {
    cleanup();
    instance.dispose();
  }
});
