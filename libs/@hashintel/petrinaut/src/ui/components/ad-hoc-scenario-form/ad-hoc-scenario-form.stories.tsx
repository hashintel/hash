import { useState } from "react";

import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  EMPTY_AD_HOC_STATE,
  type AdHocColouredPlace,
  type AdHocScenarioState,
  type AdHocSynthesisContext,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { LanguageClientProvider } from "../../../react/lsp/provider";
import { SDCPNContext } from "../../../react/state/sdcpn-context";
import { MonacoProvider } from "../../monaco/provider";
import { AdHocScenarioForm } from "./ad-hoc-scenario-form";

import type { SDCPNContextValue } from "../../../react/state/sdcpn-context";
import type { AdHocFormSelection } from "./form-context";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Components / AdHocScenarioForm",
  parameters: {
    layout: "padded",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * The Satellites Launcher net from the design thread: a coloured Space place
 * whose tokens are satellites (x, y, direction, velocity), an uncoloured
 * Debris place, and the two net parameters the orbit maths reads.
 */
const satellitesContext: AdHocSynthesisContext = {
  netParameters: [
    {
      id: "param-radius",
      name: "Planet radius",
      variableName: "planet_radius",
      type: "real",
      defaultValue: "6371",
    },
    {
      id: "param-gravitation",
      name: "Gravitational constant",
      variableName: "gravitational_constant",
      type: "real",
      defaultValue: "398600",
    },
  ],
  places: [
    {
      id: "place-space",
      name: "Space",
      colorId: "colour-satellite",
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
    {
      id: "place-debris",
      name: "Debris",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
  types: [
    {
      id: "colour-satellite",
      name: "Satellite",
      iconSlug: "circle",
      displayColor: "#3676b8",
      elements: [
        { elementId: "e1", name: "x", type: "real" },
        { elementId: "e2", name: "y", type: "real" },
        { elementId: "e3", name: "direction", type: "real" },
        { elementId: "e4", name: "velocity", type: "real" },
      ],
    },
  ],
};

const satellitesSpace: AdHocColouredPlace = {
  kind: "coloured",
  variables: [
    {
      name: "angle",
      type: "real",
      expression: "Math.PI * 2 * (i / count)",
      optimize: null,
    },
    {
      name: "distance",
      type: "real",
      expression: "parameters.planet_radius + scenario.altitude",
      optimize: null,
    },
  ],
  rows: [
    {
      kind: "template",
      count: { expression: "scenario.n_satellites", optimize: null },
      cells: [
        { expression: "Math.cos(angle) * distance", optimize: null },
        { expression: "Math.sin(angle) * distance", optimize: null },
        { expression: "angle + Math.PI / 2", optimize: null },
        {
          expression: "Math.sqrt(parameters.gravitational_constant / distance)",
          optimize: null,
        },
      ],
    },
    {
      kind: "fixed",
      cells: [
        { expression: "0", optimize: null },
        { expression: "distance", optimize: null },
        { expression: "0", optimize: null },
        { expression: "0", optimize: null },
      ],
    },
  ],
  sharedColumns: {},
};

const satellitesState: AdHocScenarioState = {
  variables: [
    { name: "altitude", type: "real", expression: "400", optimize: null },
    { name: "n_satellites", type: "integer", expression: "12", optimize: null },
  ],
  netParameters: [],
  places: {
    "place-space": satellitesSpace,
    "place-debris": {
      kind: "uncoloured",
      count: { expression: "40", optimize: null },
    },
  },
};

const optimizedSatellitesState: AdHocScenarioState = {
  ...satellitesState,
  variables: [
    {
      ...satellitesState.variables[0]!,
      optimize: { min: "200", max: "2000", scale: "log" },
    },
    satellitesState.variables[1]!,
  ],
  places: {
    ...satellitesState.places,
    "place-space": {
      ...satellitesSpace,
      rows: [
        {
          kind: "template",
          count: {
            expression: "scenario.n_satellites",
            optimize: { min: "1", max: "24", scale: "linear" },
          },
          cells: satellitesSpace.rows[0]!.cells,
        },
      ],
    },
  },
};

const sharedColumnState: AdHocScenarioState = {
  ...satellitesState,
  places: {
    ...satellitesState.places,
    "place-space": {
      ...satellitesSpace,
      sharedColumns: {
        velocity: { expression: "7.66", optimize: null },
      },
    },
  },
};

/** A second, simpler model: one two-field colour and no net parameters. */
const pumpsContext: AdHocSynthesisContext = {
  netParameters: [],
  places: [
    {
      id: "place-pumps",
      name: "Pumps",
      colorId: "colour-pump",
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
    {
      id: "place-queue",
      name: "Queue",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
  types: [
    {
      id: "colour-pump",
      name: "Pump",
      iconSlug: "circle",
      displayColor: "#000000",
      elements: [
        { elementId: "e1", name: "pressure", type: "real" },
        { elementId: "e2", name: "worn", type: "boolean" },
      ],
    },
  ],
};

const emptyContext: AdHocSynthesisContext = {
  netParameters: [],
  places: [],
  types: [],
};

/**
 * The stories run the real language client (a bundled worker) so the full
 * type-checking experience works: the SDCPN built from the fixture is what
 * the ad-hoc LSP session resolves names and types against.
 */
const toSdcpn = (context: AdHocSynthesisContext): SDCPN => ({
  places: context.places,
  transitions: [],
  types: context.types,
  parameters: context.netParameters,
  differentialEquations: [],
});

const toSdcpnContextValue = (
  context: AdHocSynthesisContext,
): SDCPNContextValue => ({
  createNewNet: () => {},
  existingNets: [],
  loadPetriNet: () => {},
  petriNetId: "story-net",
  petriNetDefinition: toSdcpn(context),
  readonly: false,
  extensions: DEFAULT_PETRINAUT_EXTENSIONS,
  setTitle: () => {},
  title: "Story Net",
  getItemType: () => null,
});

const Demo: React.FC<{
  context: AdHocSynthesisContext;
  initial: AdHocScenarioState;
  selection: AdHocFormSelection;
}> = ({ context, initial, selection }) => {
  const [state, setState] = useState(initial);
  return (
    <SDCPNContext value={toSdcpnContextValue(context)}>
      <LanguageClientProvider>
        <MonacoProvider>
          <div style={{ width: 820 }}>
            <AdHocScenarioForm
              state={state}
              onChange={setState}
              context={context}
              selection={selection}
            />
          </div>
        </MonacoProvider>
      </LanguageClientProvider>
    </SDCPNContext>
  );
};

export const Satellites: Story = {
  render: () => (
    <Demo
      context={satellitesContext}
      initial={satellitesState}
      selection="optimize"
    />
  ),
};

export const SatellitesForPlainRuns: Story = {
  render: () => (
    <Demo
      context={satellitesContext}
      initial={satellitesState}
      selection="none"
    />
  ),
};

/** Optimization: select which values the optimizer searches over. */
export const SatellitesOptimization: Story = {
  render: () => (
    <Demo
      context={satellitesContext}
      initial={optimizedSatellitesState}
      selection="optimize"
    />
  ),
};

/** Classical scenario: select which values are exposed as controls. */
export const SatellitesScenarioControls: Story = {
  render: () => (
    <Demo
      context={satellitesContext}
      initial={optimizedSatellitesState}
      selection="controls"
    />
  ),
};

export const SharedColumn: Story = {
  render: () => (
    <Demo
      context={satellitesContext}
      initial={sharedColumnState}
      selection="optimize"
    />
  ),
};

export const TwoFieldModel: Story = {
  render: () => (
    <Demo
      context={pumpsContext}
      initial={EMPTY_AD_HOC_STATE}
      selection="optimize"
    />
  ),
};

export const EmptyNet: Story = {
  render: () => (
    <Demo
      context={emptyContext}
      initial={EMPTY_AD_HOC_STATE}
      selection="optimize"
    />
  ),
};
