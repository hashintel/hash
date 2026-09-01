/**
 * @vitest-environment jsdom
 */
import { act, render } from "@testing-library/react";
import { use, useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  type SDCPN,
  type SelectionMap,
} from "@hashintel/petrinaut-core";

import {
  defaultPetrinautNavigationState,
  PetrinautNavigationProvider,
  type PetrinautNavigationController,
  type PetrinautNavigationState,
} from "../navigation";
import { EditorContext, type EditorContextValue } from "./editor-context";
import { EditorProvider } from "./editor-provider";
import { SDCPNContext, type SDCPNContextValue } from "./sdcpn-context";

const emptySdcpn: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
  subnets: [],
  componentInstances: [],
  scenarios: [],
};

const makeSdcpnContextValue = (
  getItemType: SDCPNContextValue["getItemType"],
): SDCPNContextValue => ({
  createNewNet: () => {},
  existingNets: [],
  loadPetriNet: () => {},
  petriNetId: "test-net",
  petriNetDefinition: emptySdcpn,
  readonly: false,
  extensions: DEFAULT_PETRINAUT_EXTENSIONS,
  setTitle: () => {},
  title: "Test",
  getItemType,
});

type RecordedNavigation = {
  history: "push" | "replace";
  intent: { cause: string; action: string; phase?: string };
};

const EditorContextGrabber = ({
  onContextValue,
}: {
  onContextValue: (value: EditorContextValue) => void;
}) => {
  onContextValue(use(EditorContext));
  return null;
};

/**
 * A minimal controlled host: applies every navigation to React state (as a
 * real router integration would) and records the history/intent options.
 */
const TestHost = ({
  children,
  initialState,
  recorded,
}: {
  children: React.ReactNode;
  initialState?: Partial<PetrinautNavigationState>;
  recorded: RecordedNavigation[];
}) => {
  const [state, setState] = useState<PetrinautNavigationState>({
    ...defaultPetrinautNavigationState,
    ...initialState,
  });
  const controller: PetrinautNavigationController = {
    state,
    onNavigate: (update, options) => {
      recorded.push(options as RecordedNavigation);
      setState(update);
    },
  };
  return (
    <PetrinautNavigationProvider controller={controller}>
      {children}
    </PetrinautNavigationProvider>
  );
};

const selectionOf = (...ids: string[]): SelectionMap =>
  new Map(ids.map((id) => [id, { type: "place" as const, id }]));

describe("EditorProvider selection gestures", () => {
  let editor: EditorContextValue;
  let recorded: RecordedNavigation[];

  beforeEach(() => {
    recorded = [];
    render(
      <SDCPNContext.Provider value={makeSdcpnContextValue(() => "place")}>
        <TestHost recorded={recorded}>
          <EditorProvider>
            <EditorContextGrabber
              onContextValue={(value) => {
                editor = value;
              }}
            />
          </EditorProvider>
        </TestHost>
      </SDCPNContext.Provider>,
    );
  });

  const flushMicrotasks = () => act(async () => {});

  it("coalesces react-flow batched updates and records one entry per gesture", async () => {
    act(() => {
      editor.beginSelectionGesture();
      // Two callbacks from the same react-flow event burst.
      editor.setSelection(selectionOf("place-a"), { batch: "react-flow" });
      editor.setSelection(selectionOf("place-a", "place-b"), {
        batch: "react-flow",
      });
    });
    await flushMicrotasks();

    // One navigation for the burst; the gesture's first commit pushes.
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      history: "push",
      intent: { cause: "user", action: "selection", phase: "start" },
    });

    // Later commits of the same gesture continue via replace.
    act(() => {
      editor.setSelection(selectionOf("place-c"), { batch: "react-flow" });
    });
    await flushMicrotasks();
    expect(recorded).toHaveLength(2);
    expect(recorded[1]).toMatchObject({
      history: "replace",
      intent: { phase: "continue" },
    });

    // A discrete selection after the gesture ends pushes again.
    act(() => {
      editor.endSelectionGesture();
      editor.setSelection(selectionOf("place-d"));
    });
    expect(recorded).toHaveLength(3);
    expect(recorded[2]).toMatchObject({
      history: "push",
      intent: { phase: "discrete" },
    });
  });

  it("flushes the gesture's final batched change as a continuation", async () => {
    act(() => {
      editor.beginSelectionGesture();
      editor.setSelection(selectionOf("place-a"), { batch: "react-flow" });
    });
    await flushMicrotasks();
    expect(recorded).toHaveLength(1);

    // React Flow delivers the final selection change and the gesture end in
    // the same pointerup event — before the batch's microtask would run. The
    // gesture end must flush it as a continuation, not a discrete push.
    act(() => {
      editor.setSelection(selectionOf("place-a", "place-b"), {
        batch: "react-flow",
      });
      editor.endSelectionGesture();
    });
    await flushMicrotasks();
    expect(recorded).toHaveLength(2);
    expect(recorded[1]).toMatchObject({
      history: "replace",
      intent: { phase: "continue" },
    });
  });

  it("resets an interrupted gesture on window pointerup", async () => {
    act(() => {
      editor.beginSelectionGesture();
      editor.setSelection(selectionOf("place-a"), { batch: "react-flow" });
    });
    await flushMicrotasks();
    expect(recorded[0]?.intent.phase).toBe("start");

    // The pointer was released outside react-flow's handlers, so the gesture
    // must not keep marking later selections as continuations.
    act(() => {
      window.dispatchEvent(new Event("pointerup"));
    });
    act(() => {
      editor.setSelection(selectionOf("place-b"), { batch: "react-flow" });
    });
    await flushMicrotasks();
    expect(recorded[1]?.intent.phase).toBe("discrete");
  });
});

describe("EditorProvider deep-link normalization", () => {
  it("strips unknown resources and stale selection items once, via replace", async () => {
    const recorded: RecordedNavigation[] = [];
    let editor: EditorContextValue;
    // "place-a" still exists; "place-gone" was deleted from the net.
    const getItemType: SDCPNContextValue["getItemType"] = (id) =>
      id === "place-a" ? "place" : null;

    const view = render(
      <SDCPNContext.Provider value={makeSdcpnContextValue(getItemType)}>
        <TestHost
          recorded={recorded}
          initialState={{
            mode: "simulate",
            simulateResource: { type: "scenario", id: "missing-scenario" },
            selection: [
              { type: "place", id: "place-a" },
              { type: "place", id: "place-gone" },
            ],
          }}
        >
          <EditorProvider>
            <EditorContextGrabber
              onContextValue={(value) => {
                editor = value;
              }}
            />
          </EditorProvider>
        </TestHost>
      </SDCPNContext.Provider>,
    );
    await act(async () => {});

    // One self-healing navigation: the unknown scenario resource and the
    // deleted selection item are dropped, the valid item survives.
    const normalizations = recorded.filter(
      (entry) => entry.intent.cause === "normalization",
    );
    expect(normalizations).toHaveLength(1);
    expect(normalizations[0]?.history).toBe("replace");
    expect(editor!.simulateDrawer).toEqual({ type: "closed" });
    expect(Array.from(editor!.selection.keys())).toEqual(["place-a"]);

    // The normalized state is stable: re-rendering does not re-fire it.
    view.rerender(
      <SDCPNContext.Provider value={makeSdcpnContextValue(getItemType)}>
        <TestHost recorded={recorded} initialState={{ mode: "simulate" }}>
          <EditorProvider>
            <EditorContextGrabber
              onContextValue={(value) => {
                editor = value;
              }}
            />
          </EditorProvider>
        </TestHost>
      </SDCPNContext.Provider>,
    );
    await act(async () => {});
    expect(
      recorded.filter((entry) => entry.intent.cause === "normalization"),
    ).toHaveLength(1);
  });
});

describe("EditorProvider creation drawers", () => {
  let editor: EditorContextValue;

  const openExperimentWithCreateOverlay = () => {
    const recorded: RecordedNavigation[] = [];
    render(
      <SDCPNContext.Provider value={makeSdcpnContextValue(() => "place")}>
        <TestHost
          recorded={recorded}
          initialState={{
            mode: "simulate",
            simulateView: "experiments",
            simulateResource: { type: "experiment", id: "experiment-a" },
          }}
        >
          <EditorProvider>
            <EditorContextGrabber
              onContextValue={(value) => {
                editor = value;
              }}
            />
          </EditorProvider>
        </TestHost>
      </SDCPNContext.Provider>,
    );
    act(() => {
      editor.setSimulateDrawer({ type: "create-experiment" });
    });
  };

  it("reveals the record underneath when the create drawer closes", () => {
    openExperimentWithCreateOverlay();
    // The create drawer layers over the open experiment.
    expect(editor!.simulateDrawer).toEqual({ type: "create-experiment" });

    act(() => {
      editor!.setSimulateDrawer({ type: "closed" });
    });

    expect(editor!.simulateDrawer).toEqual({
      type: "view-experiment",
      experimentId: "experiment-a",
    });
  });

  it("drops the record when the Simulate section changes", () => {
    openExperimentWithCreateOverlay();

    act(() => {
      editor!.setSimulateViewMode("scenarios");
    });

    // The record belongs to the section being left, so it cannot reappear on
    // switching back.
    expect(editor!.simulateViewMode).toBe("scenarios");
    expect(editor!.simulateDrawer).toEqual({ type: "closed" });
  });
});
