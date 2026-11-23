/** @vitest-environment jsdom */
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { useHeldNetManagement } from "./use-held-net-management";

import type { NetManagement } from "../../react/host/net-management-context";

afterEach(cleanup);

const nets = () => [
  { netId: "a", title: "First", lastUpdated: "2026-01-01T00:00:00.000Z" },
  { netId: "b", title: "Second", lastUpdated: "2026-01-02T00:00:00.000Z" },
];

/** What a host passes on one of its renders: everything is a new object. */
const hostProps = (overrides: Partial<NetManagement> = {}): NetManagement => ({
  title: "First",
  setTitle: vi.fn(),
  existingNets: nets(),
  createNewNet: vi.fn(),
  loadPetriNet: vi.fn(),
  ...overrides,
});

it("keeps one value across host renders that say the same", () => {
  const { result, rerender } = renderHook(useHeldNetManagement, {
    initialProps: hostProps(),
  });
  const first = result.current;

  rerender(hostProps());

  expect(result.current).toBe(first);
});

it("calls the host's latest callback under the identity it first gave", () => {
  const { result, rerender } = renderHook(useHeldNetManagement, {
    initialProps: hostProps(),
  });
  const { loadPetriNet } = result.current;
  const latest = vi.fn();

  rerender(hostProps({ loadPetriNet: latest }));
  loadPetriNet("b");

  expect(result.current.loadPetriNet).toBe(loadPetriNet);
  expect(latest).toHaveBeenCalledExactlyOnceWith("b");
});

it("takes the new list when a net in it changes", () => {
  const { result, rerender } = renderHook(useHeldNetManagement, {
    initialProps: hostProps(),
  });
  const first = result.current;
  const renamed = nets().map((net) =>
    net.netId === "b" ? { ...net, title: "Renamed" } : net,
  );

  rerender(hostProps({ existingNets: renamed }));

  expect(result.current).not.toBe(first);
  expect(result.current.existingNets).toBe(renamed);
});

it("takes a new title", () => {
  const { result, rerender } = renderHook(useHeldNetManagement, {
    initialProps: hostProps(),
  });

  rerender(hostProps({ title: "Renamed" }));

  expect(result.current.title).toBe("Renamed");
});

it("offers no title setter when the host gave none", () => {
  const { result } = renderHook(useHeldNetManagement, {
    initialProps: hostProps({ setTitle: undefined }),
  });

  expect(result.current.setTitle).toBeUndefined();
});
