/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { use, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  toPetrinautId,
  type PetrinautRules,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import {
  defaultPetrinautNavigationState,
  PetrinautNavigationProvider,
  type PetrinautNavigationController,
  type PetrinautNavigationIntent,
  type PetrinautNavigationState,
} from "../navigation";
import { ActiveNetContext } from "./active-net-context";
import { ActiveNetProvider } from "./active-net-provider";
import { CompositionContext } from "./composition-context";
import { SDCPNContext, type SDCPNContextValue } from "./sdcpn-context";

afterEach(cleanup);

const componentId = toPetrinautId("component__legacy");

const sdcpn: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
  components: [
    {
      id: componentId,
      name: "Component",
      places: [],
      transitions: [],
      types: [],
      parameters: [],
      differentialEquations: [],
    },
  ],
};

const sdcpnContextValue: SDCPNContextValue = {
  petriNetId: toPetrinautId("test-net"),
  petriNetDefinition: sdcpn,
  readonly: false,
  extensions: DEFAULT_PETRINAUT_EXTENSIONS,
  getItemType: () => null,
};

type RecordedNavigation = {
  componentId: string | null;
  intent: PetrinautNavigationIntent;
};

const ActiveComponent = () => (
  <output>{use(ActiveNetContext).activeComponentId ?? "root"}</output>
);

const TestHost = ({
  requestedComponentId,
  recorded,
  rules = {},
}: {
  requestedComponentId: string;
  recorded: RecordedNavigation[];
  rules?: PetrinautRules;
}) => {
  const [state, setState] = useState<PetrinautNavigationState>({
    ...defaultPetrinautNavigationState,
    componentId: requestedComponentId,
  });
  const controller: PetrinautNavigationController = {
    state,
    onNavigate: (update, { intent }) => {
      const next = update(state);
      recorded.push({ componentId: next.componentId, intent });
      setState(next);
    },
  };
  return (
    <SDCPNContext value={sdcpnContextValue}>
      <CompositionContext value={{ ...use(CompositionContext), rules }}>
        <PetrinautNavigationProvider controller={controller}>
          <ActiveNetProvider>
            <ActiveComponent />
          </ActiveNetProvider>
        </PetrinautNavigationProvider>
      </CompositionContext>
    </SDCPNContext>
  );
};

const normalizationTo = (target: string | null): RecordedNavigation => ({
  componentId: target,
  intent: { cause: "normalization", action: "component" },
});

describe("ActiveNetProvider", () => {
  it("opens a component requested by its legacy id and rewrites the location", () => {
    const recorded: RecordedNavigation[] = [];
    render(
      <TestHost requestedComponentId="component__legacy" recorded={recorded} />,
    );

    expect(screen.getByRole("status").textContent).toBe(componentId);
    expect(recorded).toEqual([normalizationTo(componentId)]);
  });

  it("keeps a canonical component id as it is", () => {
    const recorded: RecordedNavigation[] = [];
    render(<TestHost requestedComponentId={componentId} recorded={recorded} />);

    expect(screen.getByRole("status").textContent).toBe(componentId);
    expect(recorded).toEqual([]);
  });

  it("stays on the root net in an editor that only composes", () => {
    const recorded: RecordedNavigation[] = [];
    render(
      <TestHost
        requestedComponentId={componentId}
        recorded={recorded}
        rules={{ edit: "compose" }}
      />,
    );

    expect(screen.getByRole("status").textContent).toBe("root");
    expect(recorded).toEqual([normalizationTo(null)]);
  });

  it("falls back to the root net for an unknown component id", () => {
    const recorded: RecordedNavigation[] = [];
    render(<TestHost requestedComponentId="missing" recorded={recorded} />);

    expect(screen.getByRole("status").textContent).toBe("root");
    expect(recorded).toEqual([normalizationTo(null)]);
  });
});
