/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("./views/Editor/editor-view", async () => {
  const [{ use }, { SDCPNContext }, { TopBar }, { usePetrinautNavigation }] =
    await Promise.all([
      import("react"),
      import("../react/state/sdcpn-context"),
      import("./views/Editor/components/TopBar/top-bar"),
      import("../react/navigation"),
    ]);

  return {
    EditorView: ({ titleEditable }: { titleEditable: boolean }) => {
      const {
        setTitle,
        title,
        titleEditable: contextTitleEditable,
      } = use(SDCPNContext);
      const { state, navigate } = usePetrinautNavigation();

      return (
        <div
          data-testid="title-capability"
          data-available={contextTitleEditable}
        >
          <TopBar
            actualModeAvailable={false}
            menuItems={[]}
            title={title}
            onTitleChange={setTitle}
            titleEditable={titleEditable}
            mode="edit"
            onModeChange={() => {}}
          />
          <button
            type="button"
            onClick={() =>
              navigate(
                {
                  mode: "simulate",
                  simulateView: "scenarios",
                  simulateResource: { type: "scenario", id: "scenario-1" },
                  simulatePresentation: "fullscreen",
                },
                { cause: "user", action: "simulation-resource" },
              )
            }
          >
            Open scenario
          </button>
          {(["experiments", "scenarios"] as const).map((view) => (
            <button
              key={view}
              type="button"
              onClick={() =>
                navigate(
                  { simulateView: view, simulateResource: null },
                  { cause: "user", action: "simulation-view" },
                )
              }
            >
              {view}
            </button>
          ))}
          <output aria-label="Simulation location">
            {state.simulateResource?.id ?? "none"}/
            {state.simulatePresentation ?? "panel"}
          </output>
        </div>
      );
    },
  };
});

import { createJsonDocHandle, type SDCPN } from "@hashintel/petrinaut-core";

import { defaultPetrinautNavigationState } from "../react/navigation";
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

const testSdcpn: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  differentialEquations: [],
  parameters: [],
  scenarios: [
    {
      id: "scenario-1",
      name: "Scenario",
      scenarioParameters: [],
      parameterOverrides: {},
      initialState: { type: "per_place", content: {} },
    },
  ],
};

const createHandle = () =>
  createJsonDocHandle({ initial: structuredClone(testSdcpn) });

afterEach(cleanup);

describe("Petrinaut title editing", () => {
  test("renders the title read-only when setTitle is omitted", () => {
    render(<Petrinaut handle={createHandle()} title="Remote model" />);

    expect(screen.getByText("Remote model")).not.toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      screen.getByTestId("title-capability").getAttribute("data-available"),
    ).toBe("false");
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
    expect(
      screen.getByTestId("title-capability").getAttribute("data-available"),
    ).toBe("true");

    fireEvent.change(titleInput, { target: { value: "Renamed model" } });

    expect(setTitle).toHaveBeenCalledOnce();
    expect(setTitle.mock.calls[0]?.[0]).toBe("Renamed model");
  });
});

test.each([false, true])(
  "clears remembered simulation tabs when opening another document (controlled: %s)",
  async (controlled) => {
    const Editor = () => {
      const [handle, setHandle] = useState(createHandle);
      const [state, setState] = useState(defaultPetrinautNavigationState);
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setHandle(createHandle());
              setState((current) => ({
                ...current,
                simulateResource: null,
                simulatePresentation: undefined,
              }));
            }}
          >
            Open another document
          </button>
          <Petrinaut
            handle={handle}
            title="Model"
            navigation={
              controlled
                ? { state, onNavigate: (update) => setState(update) }
                : undefined
            }
          />
        </>
      );
    };
    render(<Editor />);
    const location = () =>
      screen.getByLabelText("Simulation location").textContent;
    fireEvent.click(screen.getByRole("button", { name: "Open scenario" }));
    await waitFor(() => expect(location()).toBe("scenario-1/fullscreen"));
    fireEvent.click(screen.getByRole("button", { name: "experiments" }));
    await waitFor(() => expect(location()).toBe("none/panel"));
    fireEvent.click(screen.getByRole("button", { name: "scenarios" }));
    await waitFor(() => expect(location()).toBe("scenario-1/fullscreen"));
    fireEvent.click(screen.getByRole("button", { name: "experiments" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Open another document" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "scenarios" }));
    await waitFor(() => expect(location()).toBe("none/panel"));
  },
);
