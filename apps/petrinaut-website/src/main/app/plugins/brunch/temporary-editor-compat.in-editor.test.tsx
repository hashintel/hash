/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, beforeAll, expect, test, vi } from "vitest";

import { createJsonDocHandle } from "@hashintel/petrinaut-core";
import { useReadOnlyReason } from "@hashintel/petrinaut/react";
import { Petrinaut } from "@hashintel/petrinaut/ui";
import {
  definePetrinautPlugin,
  type PluginHook,
} from "@hashintel/petrinaut/ui/plugin";

import {
  InProcessLspWorker,
  NoopResizeObserver,
  preloadLanguageServer,
} from "../../shared/petrinaut-jsdom";
import {
  type TemporaryEditOperation,
  useTemporaryEditRefusal,
} from "./temporary-editor-compat";

await vi.hoisted(async () => {
  const { installPetrinautDomShims } =
    await import("../../shared/petrinaut-jsdom");
  installPetrinautDomShims();
});

beforeAll(async () => {
  vi.stubGlobal("ResizeObserver", NoopResizeObserver);
  vi.stubGlobal("Worker", InProcessLspWorker);
  await preloadLanguageServer();
}, 30_000);

afterEach(cleanup);

const probedOperations: readonly TemporaryEditOperation[] = [
  "addPlace",
  "addScenario",
  "updateMetric",
  "applyAutoLayout",
];

/** The first reader the probe received, kept to call after the editor changes. */
const firstReader: { current?: ReturnType<typeof useTemporaryEditRefusal> } =
  {};

/**
 * Reads each operation's refusal when Read is pressed, as the chat reads one
 * when a tool call runs, and shows the editor's own reason for comparison.
 */
const EligibilityProbe = ({ enterSimulate }: { enterSimulate: () => void }) => {
  const editRefusal = useTemporaryEditRefusal();
  useEffect(() => {
    if (firstReader.current === undefined) {
      firstReader.current = editRefusal;
    }
  }, [editRefusal]);
  const editorReason = useReadOnlyReason();
  const [readOnPress, setReadOnPress] = useState<string>("not read");
  const [readAll, setReadAll] = useState<Record<string, string>>({});

  return (
    <div>
      <output aria-label="editor reason">{editorReason?.kind ?? "none"}</output>
      {probedOperations.map((operation) => (
        <output key={operation} aria-label={operation}>
          {readAll[operation] ?? "not read"}
        </output>
      ))}
      <button
        type="button"
        onClick={() =>
          setReadAll(
            Object.fromEntries(
              probedOperations.map((operation) => [
                operation,
                editRefusal(operation)?.kind ?? "allowed",
              ]),
            ),
          )
        }
      >
        Read all
      </button>
      <button type="button" onClick={enterSimulate}>
        Enter simulate
      </button>
      <button
        type="button"
        onClick={() =>
          setReadOnPress(editRefusal("addPlace")?.kind ?? "allowed")
        }
      >
        Read addPlace
      </button>
      <output aria-label="read on press">{readOnPress}</output>
    </div>
  );
};

const EligibilityProbePlugin = definePetrinautPlugin({
  id: "test.temporary-edit-eligibility",
  name: "Temporary edit eligibility probe",
  description: "Reads the temporary edit-refusal adapter inside the editor.",
  author: "HASH",
  access: { editor: "write" },
  assistant: true,
});

const useEligibilityProbePlugin: PluginHook<typeof EligibilityProbePlugin> = (
  api,
) => ({
  assistant: {
    content: (
      <EligibilityProbe
        enterSimulate={() => api.editor.navigate({ mode: "simulate" })}
      />
    ),
  },
});

const eligibilityProbePlugin = EligibilityProbePlugin(
  useEligibilityProbePlugin,
);

const shown = (operation: string) =>
  screen.getByLabelText(operation).textContent;

/** Moves the editor to Simulate through the plugin API and waits for it. */
const enterSimulateMode = async () => {
  fireEvent.click(screen.getByText("Enter simulate"));
  await waitFor(() => expect(shown("editor reason")).toBe("simulate-mode"));
};

/** Opens the assistant panel, whose closed content is inert. */
const openPanel = async () =>
  fireEvent.click(
    await screen.findByRole("button", { name: "Show AI assistant" }),
  );

test("reads the editor's current refusal per operation, keeping scenario and metric edits outside edit mode", async () => {
  const handle = createJsonDocHandle({
    initial: { places: [], transitions: [] },
  });
  const before = structuredClone(handle.doc());
  const view = render(
    <Petrinaut handle={handle} plugins={[eligibilityProbePlugin]} />,
  );
  await openPanel();
  const readAll = () => fireEvent.click(screen.getByText("Read all"));

  readAll();
  expect(shown("editor reason")).toBe("none");
  for (const operation of probedOperations) {
    expect(shown(operation)).toBe("allowed");
  }

  await enterSimulateMode();
  readAll();
  expect(shown("addPlace")).toBe("simulate-mode");
  expect(shown("applyAutoLayout")).toBe("simulate-mode");
  expect(shown("addScenario")).toBe("allowed");
  expect(shown("updateMetric")).toBe("allowed");

  view.rerender(
    <Petrinaut handle={handle} plugins={[eligibilityProbePlugin]} readonly />,
  );
  await waitFor(() => expect(shown("editor reason")).toBe("host-readonly"));
  readAll();
  for (const operation of probedOperations) {
    expect(shown(operation)).toBe("host-readonly");
  }
  // Querying never changes the document.
  expect(handle.doc()).toEqual(before);
});

test("answers a later call, from a reader captured earlier, with the editor's state at that moment", async () => {
  Reflect.deleteProperty(firstReader, "current");
  const handle = createJsonDocHandle({
    initial: { places: [], transitions: [] },
  });
  const view = render(
    <Petrinaut handle={handle} plugins={[eligibilityProbePlugin]} />,
  );
  await openPanel();

  fireEvent.click(screen.getByText("Read addPlace"));
  expect(shown("read on press")).toBe("allowed");
  const captured = firstReader.current;
  expect(captured?.("addPlace")).toBeNull();

  await enterSimulateMode();
  // The reader from the first render reads the current state, as a tool
  // call running after an await does.
  expect(captured?.("addPlace")).toEqual({ kind: "simulate-mode" });
  expect(captured?.("addScenario")).toBeNull();

  view.rerender(
    <Petrinaut handle={handle} plugins={[eligibilityProbePlugin]} readonly />,
  );
  await waitFor(() => expect(shown("editor reason")).toBe("host-readonly"));
  fireEvent.click(screen.getByText("Read addPlace"));
  expect(shown("read on press")).toBe("host-readonly");
});
