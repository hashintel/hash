/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { use } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PetrinautOptimizationContext } from "../../../../../react/optimization-context";
import { UserSettingsContext } from "../../../../../react/state/user-settings-context";
import { FakeEditorProvider } from "./experiments/experiments-story-fixtures";
import { SimulateView } from "./simulate-view";

import type { PetrinautOptimization } from "@hashintel/petrinaut-core";
import type { PetrinautConnectedOptimization } from "@hashintel/petrinaut-core/optimization";
import type { ReactNode } from "react";

vi.mock("@hashintel/ds-components", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@hashintel/ds-components")>();

  return {
    ...actual,
    SegmentedControl: ({
      items,
    }: {
      items: readonly { value: string; label?: string; tooltip?: string }[];
    }) => (
      <div>
        {items.map((item) => (
          <span key={item.value}>{item.tooltip ?? item.label}</span>
        ))}
      </div>
    ),
  };
});

vi.mock("./experiments/experiments-view", () => ({
  ExperimentsView: () => <div>Experiments view</div>,
}));
vi.mock("./metrics/metrics-view", () => ({
  MetricsView: () => <div>Metrics view</div>,
}));
vi.mock("./scenarios/scenarios-view", () => ({
  ScenariosView: () => <div>Scenarios view</div>,
}));

const capability: PetrinautOptimization = {
  createOptimizationRun: () => Promise.resolve({ runId: "run-test" }),
  async *attachOptimizationRun() {
    yield { type: "started", requestedTrials: 1, seq: 1 };
  },
  cancelOptimizationRun: () => Promise.resolve(),
};

const connectedSource: PetrinautConnectedOptimization = {
  kind: "connected",
  connect: () => ({
    ...capability,
    extendOptimizationRun: () => Promise.resolve(),
    releaseOptimizationRun: () => Promise.resolve(),
    dispose: () => {},
  }),
};

/** Overrides the In-browser optimization setting below the default context. */
const InBrowserOptimizationSetting = ({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) => {
  const value = use(UserSettingsContext);
  return (
    <UserSettingsContext
      value={{ ...value, enableInBrowserOptimization: enabled }}
    >
      {children}
    </UserSettingsContext>
  );
};

afterEach(cleanup);

/** The tab list, whatever optimization source the host provides and whatever the setting says. */
const tabsUnder = (wrap: (view: ReactNode) => ReactNode): string[] => {
  const { container, unmount } = render(
    wrap(
      <FakeEditorProvider>
        <SimulateView />
      </FakeEditorProvider>,
    ),
  );
  const tabs = [...container.querySelectorAll("span")].map(
    (tab) => tab.textContent,
  );
  unmount();
  return tabs;
};

describe("SimulateView tabs", () => {
  it("are Experiments and Scenarios whatever the optimization source and setting", () => {
    expect(tabsUnder((view) => view)).toEqual(["Experiments", "Scenarios"]);
    expect(
      tabsUnder((view) => (
        <PetrinautOptimizationContext value={capability}>
          {view}
        </PetrinautOptimizationContext>
      )),
    ).toEqual(["Experiments", "Scenarios"]);
    for (const enabled of [false, true]) {
      expect(
        tabsUnder((view) => (
          <InBrowserOptimizationSetting enabled={enabled}>
            <PetrinautOptimizationContext value={connectedSource}>
              {view}
            </PetrinautOptimizationContext>
          </InBrowserOptimizationSetting>
        )),
      ).toEqual(["Experiments", "Scenarios"]);
    }
    expect(screen.queryByText("Optimizations")).toBeNull();
  });
});
