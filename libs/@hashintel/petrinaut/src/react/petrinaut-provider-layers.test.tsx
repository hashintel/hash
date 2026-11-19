/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { use } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  createJsonDocHandle,
  createPetrinaut,
  toPetrinautId,
  type Library,
  type Petrinaut,
  type PetrinautDocHandle,
} from "@hashintel/petrinaut-core";

import { PetrinautDocumentProvider } from "./petrinaut-provider-layers";
import { ReadOnlyActionContext } from "./read-only-action-context";
import { SDCPNContext } from "./state/sdcpn-context";
import { UndoRedoContext } from "./state/undo-redo-context";
import { constantStore, useStore } from "./use-store";

// A history entry is told from the others by its timestamp, so each change
// of a test is made at a time of its own.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
const tick = () => vi.setSystemTime(Date.now() + 1000);

const warehouse: Library = {
  id: "@hashintel/warehouse",
  name: "Warehouse",
  components: [
    {
      id: "packer",
      name: "Packer",
      ports: [{ id: "orders", name: "Orders", direction: "in" }],
    },
  ],
};

const netManagement = {
  title: "Test",
  existingNets: [],
  createNewNet: () => {},
  loadPetriNet: () => {},
};

const handleWithAPlace = (historyLimit?: number) =>
  createJsonDocHandle({
    initial: {
      places: [
        {
          id: toPetrinautId("stock"),
          name: "Stock",
          colorId: null,
          dynamicsEnabled: false,
          x: 0,
          y: 0,
        },
      ],
      transitions: [],
    },
    historyLimit,
  });

/** A change a composing editor cannot make. */
const removeThePlace = (instance: Petrinaut) => {
  tick();
  act(() => instance.mutations.removePlace({ placeId: "stock" }));
};

/** A change a composing editor makes. */
const placeInstance = (instance: Petrinaut, id: string) => {
  tick();
  act(() =>
    instance.mutations.addComponentInstance({
      id,
      name: `Packer${id}`,
      component: { from: warehouse.id, id: "packer" },
      parameterValues: {},
      x: 0,
      y: 0,
    }),
  );
};

const composingOn = (handle: PetrinautDocHandle) =>
  createPetrinaut({
    document: handle,
    resolveImport: () => warehouse,
    libraries: [warehouse.id],
    rules: { edit: "compose" },
  });

const placeCount = (handle: PetrinautDocHandle) => handle.doc()?.places.length;
const instanceCount = (handle: PetrinautDocHandle) =>
  handle.doc()?.componentInstances?.length ?? 0;

const noHistory = constantStore({ entries: [], currentIndex: 0 });

/** The history as the top bar reads it, with a control for each move. */
const HistoryControls = () => {
  const undoRedo = use(UndoRedoContext);
  const canUndo = useStore(undoRedo?.canUndo ?? constantStore(false));
  const { entries, currentIndex } = useStore(undoRedo?.history ?? noHistory);
  if (!undoRedo) {
    return null;
  }
  const { undo, redo, goToIndex } = undoRedo;
  return (
    <>
      <output>
        {`at ${currentIndex} of ${entries.length}, ${canUndo ? "can" : "cannot"} undo`}
      </output>
      <button type="button" onClick={undo}>
        Undo
      </button>
      <button type="button" onClick={redo}>
        Redo
      </button>
      <button type="button" onClick={() => goToIndex(-1)}>
        Before the first
      </button>
      {entries.map((entry, index) => (
        <button
          key={entry.timestamp}
          type="button"
          onClick={() => goToIndex(index)}
        >
          {`Entry ${index}`}
        </button>
      ))}
    </>
  );
};

const Editor = ({ instance }: { instance: Petrinaut }) => (
  <PetrinautDocumentProvider instance={instance} netManagement={netManagement}>
    <HistoryControls />
  </PetrinautDocumentProvider>
);

const shown = () => screen.getByRole("status").textContent;
const click = (name: string) =>
  fireEvent.click(screen.getByRole("button", { name }));

describe("the history of an editor that only composes", () => {
  test("starts where the editor took the handle", () => {
    const handle = handleWithAPlace();
    removeThePlace(createPetrinaut({ document: handle }));
    render(<Editor instance={composingOn(handle)} />);

    expect(shown()).toBe("at 0 of 1, cannot undo");

    // Neither an undo nor a jump brings back the place removed before.
    click("Undo");
    click("Before the first");
    expect(placeCount(handle)).toBe(0);
  });

  test("moves through the changes made since, and no further back", () => {
    const handle = handleWithAPlace();
    removeThePlace(createPetrinaut({ document: handle }));
    const instance = composingOn(handle);
    render(<Editor instance={instance} />);

    placeInstance(instance, "a");
    placeInstance(instance, "b");
    expect(shown()).toBe("at 2 of 3, can undo");

    click("Undo");
    expect(instanceCount(handle)).toBe(1);
    click("Redo");
    expect(instanceCount(handle)).toBe(2);

    click("Entry 0");
    expect(instanceCount(handle)).toBe(0);
    expect(shown()).toBe("at 0 of 3, cannot undo");

    click("Undo");
    expect(placeCount(handle)).toBe(0);
    // The handle's own history is as it was: all of it is still there.
    expect(handle.history?.entries.get()).toHaveLength(4);
  });

  test("starts where the mode was switched on over an editor in use", () => {
    const handle = handleWithAPlace();
    const drawing = createPetrinaut({ document: handle });
    const view = render(<Editor instance={drawing} />);
    removeThePlace(drawing);
    expect(shown()).toBe("at 1 of 2, can undo");

    view.rerender(<Editor instance={composingOn(handle)} />);
    expect(shown()).toBe("at 0 of 1, cannot undo");
    click("Undo");
    expect(placeCount(handle)).toBe(0);

    // Back out of the mode, the whole history is the editor's again.
    view.rerender(<Editor instance={drawing} />);
    expect(shown()).toBe("at 1 of 2, can undo");
    click("Undo");
    expect(placeCount(handle)).toBe(1);
  });

  test("still starts there once the handle has dropped older entries", () => {
    // Room for three changes after the entry the history starts at.
    const handle = handleWithAPlace(3);
    removeThePlace(createPetrinaut({ document: handle }));
    const instance = composingOn(handle);
    render(<Editor instance={instance} />);

    placeInstance(instance, "a");
    placeInstance(instance, "b");
    placeInstance(instance, "c");
    // The handle has dropped its first entry: the one the editor started at
    // is its oldest, one index down.
    expect(handle.history?.entries.get()).toHaveLength(4);
    expect(shown()).toBe("at 3 of 4, can undo");

    click("Entry 0");
    click("Undo");
    expect(instanceCount(handle)).toBe(0);
    expect(placeCount(handle)).toBe(0);

    // Once that entry is dropped too, every entry left is the editor's own.
    click("Entry 3");
    placeInstance(instance, "d");
    expect(shown()).toBe("at 3 of 4, can undo");
    click("Entry 0");
    expect(instanceCount(handle)).toBe(1);
    expect(placeCount(handle)).toBe(0);
  });

  test("an editor that does more than compose keeps the whole history", () => {
    const handle = handleWithAPlace();
    const instance = createPetrinaut({ document: handle });
    removeThePlace(instance);
    render(<Editor instance={instance} />);

    expect(shown()).toBe("at 1 of 2, can undo");
    click("Undo");
    expect(placeCount(handle)).toBe(1);
  });
});

describe("what the host owns", () => {
  // Counted from inside the reader. A `Profiler` around it misses a render
  // that a context starts below it.
  const onDocumentReaderRender = vi.fn();
  /** Reads the document, as almost every part of the editor does. */
  const DocumentReader = () => {
    onDocumentReaderRender();
    return (
      <output aria-label="Open net">{use(SDCPNContext).petriNetId}</output>
    );
  };
  const ReadOnlyActionLabel = () => (
    <output aria-label="Read-only action">
      {use(ReadOnlyActionContext)?.label ?? "none"}
    </output>
  );
  // One element for every render, so only a context can render the readers.
  const readers = (
    <>
      <DocumentReader />
      <ReadOnlyActionLabel />
    </>
  );

  test("a new list of nets renders no reader of the document", () => {
    const instance = createPetrinaut({ document: handleWithAPlace() });
    const { rerender } = render(
      <PetrinautDocumentProvider
        instance={instance}
        netManagement={netManagement}
      >
        {readers}
      </PetrinautDocumentProvider>,
    );
    expect(onDocumentReaderRender).toHaveBeenCalled();
    onDocumentReaderRender.mockClear();

    // What a host that saves on every edit hands over on every key.
    rerender(
      <PetrinautDocumentProvider
        instance={instance}
        netManagement={{
          ...netManagement,
          existingNets: [
            { netId: "a", title: "A", lastUpdated: "2026-01-01T00:00:01Z" },
          ],
        }}
      >
        {readers}
      </PetrinautDocumentProvider>,
    );

    expect(onDocumentReaderRender).not.toHaveBeenCalled();
  });

  test("the host's read-only action reaches its readers", () => {
    render(
      <PetrinautDocumentProvider
        instance={createPetrinaut({ document: handleWithAPlace() })}
        netManagement={{
          ...netManagement,
          readOnlyAction: { label: "Save a copy", onClick: () => {} },
        }}
      >
        {readers}
      </PetrinautDocumentProvider>,
    );

    expect(screen.getByLabelText("Read-only action").textContent).toBe(
      "Save a copy",
    );
  });
});
