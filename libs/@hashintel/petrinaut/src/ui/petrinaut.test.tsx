/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("./views/Editor/editor-view", async () => {
  const [{ use }, { SDCPNContext }, { TopBar }] = await Promise.all([
    import("react"),
    import("../react/state/sdcpn-context"),
    import("./views/Editor/components/TopBar/top-bar"),
  ]);

  return {
    EditorView: ({ titleEditable }: { titleEditable: boolean }) => {
      const { setTitle, title } = use(SDCPNContext);

      return (
        <TopBar
          actualModeAvailable={false}
          notebookViewAvailable={false}
          menuItems={[]}
          title={title}
          onTitleChange={setTitle}
          titleEditable={titleEditable}
          mode="edit"
          onModeChange={() => {}}
        />
      );
    },
  };
});

import { createJsonDocHandle, type SDCPN } from "@hashintel/petrinaut-core";

import { Petrinaut } from "./petrinaut";

class ObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class WorkerStub extends EventTarget {
  onerror = null;
  onmessage = null;
  onmessageerror = null;

  postMessage() {}
  terminate() {}
}

globalThis.ResizeObserver = ObserverStub as unknown as typeof ResizeObserver;
globalThis.Worker = WorkerStub as unknown as typeof Worker;

const emptySdcpn: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
};

const createHandle = () =>
  createJsonDocHandle({ initial: structuredClone(emptySdcpn) });

afterEach(cleanup);

describe("Petrinaut title editing", () => {
  test("renders the title read-only when setTitle is omitted", () => {
    render(<Petrinaut handle={createHandle()} title="Remote model" />);

    expect(screen.getByText("Remote model")).not.toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  test("edits the title through the supplied setTitle callback", () => {
    const setTitle = vi.fn();
    render(
      <Petrinaut
        handle={createHandle()}
        title="Local model"
        setTitle={setTitle}
      />,
    );

    const titleInput = screen.getByDisplayValue("Local model");
    expect(titleInput).toHaveProperty("readOnly", false);

    fireEvent.change(titleInput, { target: { value: "Renamed model" } });

    expect(setTitle).toHaveBeenCalledOnce();
    expect(setTitle.mock.calls[0]?.[0]).toBe("Renamed model");
  });
});
