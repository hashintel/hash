/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { useScenarioHir, type ScenarioHirRequest } from "./use-scenario-hir";

import type { Scenario, ScenarioHir } from "@hashintel/petrinaut-core";

afterEach(cleanup);

const scenario: Scenario = {
  id: "baseline",
  name: "Baseline",
  scenarioParameters: [],
  parameterOverrides: {},
  initialState: { type: "per_place", content: { queue: "2 * 3" } },
};

const hir: ScenarioHir = {
  version: 1,
  parameterOverrides: {},
  placeExpressions: {},
};

/** A requester that answers each request with `hir`, as the language worker would. */
const lowering = () => vi.fn<ScenarioHirRequest>(() => Promise.resolve(hir));

const Reader = ({
  of,
  request,
}: {
  of: Scenario;
  request: ScenarioHirRequest;
}) => {
  const state = useScenarioHir(of, { requestScenarioHir: request });
  return state.hir === null ? "Lowering" : "Lowered";
};

it("is pending until the request answers", async () => {
  render(<Reader of={scenario} request={lowering()} />);

  expect(screen.getByText("Lowering")).toBeDefined();
  expect(await screen.findByText("Lowered")).toBeDefined();
});

it("starts with the scenario its requester last lowered, and requests nothing", async () => {
  const request = lowering();
  const view = render(<Reader key="first" of={scenario} request={request} />);
  await screen.findByText("Lowered");

  view.rerender(<Reader key="second" of={scenario} request={request} />);

  expect(screen.getByText("Lowered")).toBeDefined();
  expect(request).toHaveBeenCalledTimes(1);
});

it("lowers a scenario whose code is not the one last lowered", async () => {
  const request = lowering();
  const view = render(<Reader key="first" of={scenario} request={request} />);
  await screen.findByText("Lowered");
  const edited: Scenario = {
    ...scenario,
    initialState: { type: "per_place", content: { queue: "7" } },
  };

  view.rerender(<Reader key="second" of={edited} request={request} />);

  expect(screen.getByText("Lowering")).toBeDefined();
  expect(await screen.findByText("Lowered")).toBeDefined();
  expect(request).toHaveBeenCalledTimes(2);
});
