/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PortalContainerContext } from "@hashintel/ds-components";

import { SDCPNContext } from "../../../../../../react/state/sdcpn-context";
import { UserSettingsProvider } from "../../../../../../react/state/user-settings-provider";
import { sirSdcpnContextValue } from "../experiments/experiments-story-fixtures";
import {
  buildPetrinautOptimizationInput,
  CreateOptimizationDrawer,
  validateOptimizationParameterDraft,
} from "./create-optimization-drawer";
import { createOptimizationParameterDraft } from "./optimization-parameter-row";

import type { OptimizationParameterDraft } from "./optimization-parameter-row";
import type { Scenario } from "@hashintel/petrinaut-core";
import type { ReactNode } from "react";

vi.mock("@hashintel/ds-components", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@hashintel/ds-components")>();
  const Drawer = Object.assign(
    ({ children }: { children: ReactNode }) => <div>{children}</div>,
    {
      Header: ({
        title,
        description,
      }: {
        title: ReactNode;
        description?: ReactNode;
      }) => (
        <header>
          {title}
          {description}
        </header>
      ),
      Body: ({ children }: { children: ReactNode }) => <main>{children}</main>,
      Footer: ({ actions }: { actions: ReactNode }) => (
        <footer>{actions}</footer>
      ),
    },
  );

  return { ...actual, Drawer };
});

const TestProviders = () => {
  const portalContainerRef = useRef<HTMLDivElement>(null);

  return (
    <PortalContainerContext value={portalContainerRef}>
      <SDCPNContext value={sirSdcpnContextValue}>
        <UserSettingsProvider>
          <div ref={portalContainerRef} />
          <CreateOptimizationDrawer open onClose={() => {}} />
        </UserSettingsProvider>
      </SDCPNContext>
    </PortalContainerContext>
  );
};

afterEach(cleanup);

describe("CreateOptimizationDrawer", () => {
  it("requires an explicit scenario before showing configuration", () => {
    render(<TestProviders />);

    expect(screen.getByText("Select a scenario")).toBeTruthy();
    expect(screen.queryByText("Scenario parameters")).toBeNull();
    expect(
      (screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("builds a complete scenario snapshot and only flat optimized variables", () => {
    const scenario = {
      id: "scenario-test",
      name: "Scenario test",
      scenarioParameters: [
        { type: "real", identifier: "rate", default: 0.5 },
        { type: "integer", identifier: "count", default: 4 },
        { type: "boolean", identifier: "enabled", default: 0 },
        { type: "ratio", identifier: "share", default: 0.25 },
      ],
      parameterOverrides: {},
      initialState: { type: "per_place", content: {} },
    } satisfies Scenario;
    const definition = {
      ...sirSdcpnContextValue.petriNetDefinition,
      scenarios: [scenario],
    };
    const metric = definition.metrics?.[0];
    expect(metric).toBeDefined();

    const [rate, count, enabled, share] = scenario.scenarioParameters;
    const drafts = {
      rate: {
        ...createOptimizationParameterDraft(rate!),
        mode: "optimize",
        minimum: 0.1,
        maximum: 2,
      },
      count: {
        ...createOptimizationParameterDraft(count!),
        mode: "optimize",
        minimum: 2,
        maximum: 10,
        step: 2,
      },
      enabled: {
        ...createOptimizationParameterDraft(enabled!),
        mode: "optimize",
      },
      share: createOptimizationParameterDraft(share!),
    } satisfies Record<string, OptimizationParameterDraft>;

    const input = buildPetrinautOptimizationInput({
      name: "Find the minimum",
      title: "Test model",
      definition,
      scenario,
      drafts,
      metricId: metric!.id,
      direction: "minimize",
      trials: 20,
      seed: 42,
      dt: 0.5,
      maxTime: 100,
      sampler: "tpe",
    });

    expect(input.scenario).toEqual({
      id: scenario.id,
      parameterValues: {
        rate: 0.5,
        count: 4,
        enabled: false,
        share: 0.25,
      },
    });
    expect(input.searchSpace.variables).toEqual([
      {
        identifier: "rate",
        domain: {
          kind: "continuous",
          minimum: 0.1,
          maximum: 2,
          scale: "linear",
        },
      },
      {
        identifier: "count",
        domain: { kind: "integer", minimum: 2, maximum: 10, step: 2 },
      },
      {
        identifier: "enabled",
        domain: { kind: "categorical", values: [false, true] },
      },
    ]);
    expect(input.objective).toEqual({
      metricId: metric!.id,
      direction: "minimize",
    });
  });

  it("explains when an integer step cannot reach the maximum", () => {
    const parameter = {
      type: "integer",
      identifier: "count",
      default: 4,
    } satisfies Scenario["scenarioParameters"][number];
    const draft = {
      ...createOptimizationParameterDraft(parameter),
      mode: "optimize",
      minimum: 2,
      maximum: 10,
      step: 3,
    } satisfies OptimizationParameterDraft;

    expect(validateOptimizationParameterDraft(parameter, draft)).toBe(
      "count step must divide its range exactly so the maximum is reachable",
    );
  });
});
