/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { use, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  toPetrinautId,
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
}: {
  requestedSubnetId: string;
  recorded: RecordedNavigation[];
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
    <SDCPNContext value={sdcpnContextValue}>
      <PetrinautNavigationProvider controller={controller}>
        <ActiveNetProvider>
          <ActiveSubnet />
        </ActiveNetProvider>
      </PetrinautNavigationProvider>
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
});
