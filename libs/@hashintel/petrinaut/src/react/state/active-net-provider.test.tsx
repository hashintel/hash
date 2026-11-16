/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { use, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  noProvidedInterfaces,
  providedComponentSubnetId,
  resolveProvidedComponents,
  toPetrinautId,
  type ProvidedComponent,
  type ProvidedInterfaces,
  type SDCPN,
  type Subnet,
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

const subnetId = toPetrinautId("subnet__legacy");

const sdcpn: SDCPN = {
  places: [],
  transitions: [],
  types: [],
  parameters: [],
  differentialEquations: [],
  subnets: [
    {
      id: subnetId,
      name: "Subnet",
      places: [],
      transitions: [],
      types: [],
      parameters: [],
      differentialEquations: [],
    },
  ],
};

const sdcpnContextValue: SDCPNContextValue = {
  createNewNet: () => {},
  existingNets: [],
  loadPetriNet: () => {},
  petriNetId: toPetrinautId("test-net"),
  petriNetDefinition: sdcpn,
  readonly: false,
  extensions: DEFAULT_PETRINAUT_EXTENSIONS,
  setTitle: () => {},
  title: "Test",
  getItemType: () => null,
};

type RecordedNavigation = {
  subnetId: string | null;
  intent: PetrinautNavigationIntent;
};

const ActiveSubnet = () => (
  <output>{use(ActiveNetContext).activeSubnetId ?? "root"}</output>
);

const TestHost = ({
  requestedSubnetId,
  recorded,
  subnets = sdcpn.subnets,
  provided = noProvidedInterfaces,
}: {
  requestedSubnetId: string;
  recorded: RecordedNavigation[];
  subnets?: Subnet[];
  provided?: ProvidedInterfaces;
}) => {
  const [state, setState] = useState<PetrinautNavigationState>({
    ...defaultPetrinautNavigationState,
    subnetId: requestedSubnetId,
  });
  const controller: PetrinautNavigationController = {
    state,
    onNavigate: (update, { intent }) => {
      const next = update(state);
      recorded.push({ subnetId: next.subnetId, intent });
      setState(next);
    },
  };
  return (
    <SDCPNContext
      value={{
        ...sdcpnContextValue,
        petriNetDefinition: { ...sdcpn, subnets },
      }}
    >
      <CompositionContext value={{ provided }}>
        <PetrinautNavigationProvider controller={controller}>
          <ActiveNetProvider>
            <ActiveSubnet />
          </ActiveNetProvider>
        </PetrinautNavigationProvider>
      </CompositionContext>
    </SDCPNContext>
  );
};

const normalizationTo = (target: string | null): RecordedNavigation => ({
  subnetId: target,
  intent: { cause: "normalization", action: "subnet" },
});

describe("ActiveNetProvider", () => {
  it("opens a subnet requested by its legacy id and rewrites the location", () => {
    const recorded: RecordedNavigation[] = [];
    render(<TestHost requestedSubnetId="subnet__legacy" recorded={recorded} />);

    expect(screen.getByRole("status").textContent).toBe(subnetId);
    expect(recorded).toEqual([normalizationTo(subnetId)]);
  });

  it("keeps a canonical subnet id as it is", () => {
    const recorded: RecordedNavigation[] = [];
    render(<TestHost requestedSubnetId={subnetId} recorded={recorded} />);

    expect(screen.getByRole("status").textContent).toBe(subnetId);
    expect(recorded).toEqual([]);
  });

  it("falls back to the root net for an unknown subnet id", () => {
    const recorded: RecordedNavigation[] = [];
    render(<TestHost requestedSubnetId="missing" recorded={recorded} />);

    expect(screen.getByRole("status").textContent).toBe("root");
    expect(recorded).toEqual([normalizationTo(null)]);
  });

  describe("under the id of a component the host provides", () => {
    const packer: ProvidedComponent = {
      id: "warehouse/packer",
      name: "Packer",
      ports: [{ name: "Orders", direction: "in" }],
    };
    const packerId = providedComponentSubnetId(packer);
    const provided = resolveProvidedComponents([packer]);
    const copy = provided.get(packerId)!;

    it("falls back to the root net for the component, which has no net to open", () => {
      const recorded: RecordedNavigation[] = [];
      render(
        <TestHost
          requestedSubnetId={packerId}
          recorded={recorded}
          subnets={[copy]}
          provided={provided}
        />,
      );

      expect(screen.getByRole("status").textContent).toBe("root");
      expect(recorded).toEqual([normalizationTo(null)]);
    });

    it("opens a subnet of the document's own that has the id alone", () => {
      const recorded: RecordedNavigation[] = [];
      render(
        <TestHost
          requestedSubnetId={packerId}
          recorded={recorded}
          subnets={[{ ...copy, interface: undefined }]}
          provided={provided}
        />,
      );

      expect(screen.getByRole("status").textContent).toBe(packerId);
      expect(recorded).toEqual([]);
    });
  });
});
