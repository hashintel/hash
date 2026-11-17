/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { use, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PetrinautInstanceContext } from "../../../../../../react/instance-context";
import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { FusionProperties } from "./main";

import type { Fusion, Petrinaut } from "@hashintel/petrinaut-core";

// The panel's sections measure themselves; jsdom has no observer.
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const belt: Fusion = {
  id: "belt",
  name: "Belt",
  members: [
    { kind: "place", placeId: "buffer" },
    { kind: "componentPort", componentInstanceId: "m1", portPlaceId: "in" },
  ],
};

const updateFusion = vi.fn();

const Wrapper = ({ children }: { children: ReactNode }) => (
  <PetrinautInstanceContext
    value={
      {
        mutations: { updateFusion },
        mutationRefusal: () => null,
      } as unknown as Petrinaut
    }
  >
    <SDCPNContext value={{ ...use(SDCPNContext), readonly: false }}>
      {children}
    </SDCPNContext>
  </PetrinautInstanceContext>
);

const renderName = () => {
  render(<FusionProperties fusion={belt} />, { wrapper: Wrapper });
  const input = screen.getByLabelText<HTMLInputElement>("Name");
  return {
    input,
    commit: (name: string) => {
      fireEvent.change(input, { target: { value: name } });
      fireEvent.blur(input);
    },
  };
};

describe("FusionProperties", () => {
  it("shows the fusion's own name, and renames it", () => {
    const { input, commit } = renderName();
    expect(input.value).toBe("Belt");

    commit("Line");

    expect(updateFusion).toHaveBeenCalledExactlyOnceWith({
      fusionId: "belt",
      update: { name: "Line" },
      targetComponentId: null,
    });
  });

  it("refuses an empty name", () => {
    const { commit } = renderName();

    commit("  ");

    expect(screen.getByText("Name cannot be empty")).not.toBeNull();
    expect(updateFusion).not.toHaveBeenCalled();
  });
});
