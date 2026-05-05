import type { Meta, StoryObj } from "@storybook/react-vite";

import { LanguageClientProvider } from "../../../../lsp/provider";
import { MonacoProvider } from "../../../../monaco/provider";
import {
  SDCPNContext,
  type SDCPNContextValue,
} from "../../../../state/sdcpn-context";
import { CreateScenarioForm } from "./create-scenario-drawer";

// -- Stub data ----------------------------------------------------------------

const EMPTY_NET: SDCPNContextValue = {
  createNewNet: () => {},
  existingNets: [],
  loadPetriNet: () => {},
  petriNetId: "story-net",
  petriNetDefinition: {
    places: [],
    transitions: [],
    types: [],
    differentialEquations: [],
    parameters: [],
  },
  readonly: false,
  setTitle: () => {},
  title: "Empty Net",
  getItemType: () => null,
};

const SIR_NET: SDCPNContextValue = {
  ...EMPTY_NET,
  title: "SIR Epidemic Model",
  petriNetDefinition: {
    places: [
      {
        id: "place__susceptible",
        name: "Susceptible",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        showAsInitialState: true,
        x: 0,
        y: 0,
      },
      {
        id: "place__infected",
        name: "Infected",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        showAsInitialState: true,
        x: 0,
        y: 0,
      },
      {
        id: "place__recovered",
        name: "Recovered",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 0,
        y: 0,
      },
    ],
    transitions: [],
    types: [],
    differentialEquations: [],
    parameters: [
      {
        id: "param__infection_rate",
        name: "Infection Rate",
        variableName: "infection_rate",
        type: "real",
        defaultValue: "3",
      },
      {
        id: "param__recovery_rate",
        name: "Recovery Rate",
        variableName: "recovery_rate",
        type: "real",
        defaultValue: "1",
      },
    ],
  },
};

const TYPED_NET: SDCPNContextValue = {
  ...EMPTY_NET,
  title: "Supply Chain",
  petriNetDefinition: {
    places: [
      {
        id: "place__orders",
        name: "Orders received",
        colorId: "type__order",
        dynamicsEnabled: false,
        differentialEquationId: null,
        showAsInitialState: true,
        x: 0,
        y: 0,
      },
      {
        id: "place__warehouse",
        name: "Warehouse",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        showAsInitialState: true,
        x: 0,
        y: 0,
      },
    ],
    transitions: [],
    types: [
      {
        id: "type__order",
        name: "Order",
        iconSlug: "circle",
        displayColor: "#30a46c",
        elements: [
          { elementId: "el_qty", name: "quantity", type: "integer" },
          { elementId: "el_priority", name: "priority", type: "real" },
        ],
      },
    ],
    differentialEquations: [],
    parameters: [
      {
        id: "param__lead_time",
        name: "Lead Time",
        variableName: "lead_time",
        type: "real",
        defaultValue: "5",
      },
    ],
  },
};

// -- Meta ---------------------------------------------------------------------

const meta = {
  title: "Simulate / Create Scenario",
  component: CreateScenarioForm,
  parameters: {
    layout: "centered",
  },
} satisfies Meta<typeof CreateScenarioForm>;

export default meta;

type Story = StoryObj<typeof meta>;

const Frame = ({
  children,
  context,
}: {
  children: React.ReactNode;
  context: SDCPNContextValue;
}) => (
  <SDCPNContext value={context}>
    <LanguageClientProvider>
      <MonacoProvider>
        <div
          style={{
            width: 520,
            height: 700,
            border: "1px solid rgba(0,0,0,0.1)",
            borderRadius: 12,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {children}
        </div>
      </MonacoProvider>
    </LanguageClientProvider>
  </SDCPNContext>
);

// -- Stories ------------------------------------------------------------------

export const EmptyNet: Story = {
  name: "Empty net",
  render: () => (
    <Frame context={EMPTY_NET}>
      <CreateScenarioForm />
    </Frame>
  ),
};

export const SIRModel: Story = {
  name: "SIR model",
  render: () => (
    <Frame context={SIR_NET}>
      <CreateScenarioForm />
    </Frame>
  ),
};

export const WithTypedPlaces: Story = {
  name: "With typed places (spreadsheet)",
  render: () => (
    <Frame context={TYPED_NET}>
      <CreateScenarioForm />
    </Frame>
  ),
};

const SATELLITES_NET: SDCPNContextValue = {
  ...EMPTY_NET,
  title: "Satellites in Orbit",
  petriNetDefinition: {
    places: [
      {
        id: "place__space",
        name: "Space",
        colorId: "type__satellite",
        dynamicsEnabled: true,
        differentialEquationId: "eq__orbit",
        showAsInitialState: true,
        x: 0,
        y: 0,
      },
      {
        id: "place__debris",
        name: "Debris",
        colorId: "type__satellite",
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 0,
        y: 0,
      },
    ],
    transitions: [],
    types: [
      {
        id: "type__satellite",
        name: "Satellite",
        iconSlug: "circle",
        displayColor: "#1E90FF",
        elements: [
          { elementId: "el_x", name: "x", type: "real" },
          { elementId: "el_y", name: "y", type: "real" },
          { elementId: "el_dir", name: "direction", type: "real" },
          { elementId: "el_vel", name: "velocity", type: "real" },
        ],
      },
    ],
    differentialEquations: [
      {
        id: "eq__orbit",
        name: "Satellite Orbit Dynamics",
        colorId: "type__satellite",
        code: "",
      },
    ],
    parameters: [
      {
        id: "param__earth_radius",
        name: "Earth Radius",
        variableName: "earth_radius",
        type: "real",
        defaultValue: "50.0",
      },
      {
        id: "param__satellite_radius",
        name: "Satellite Radius",
        variableName: "satellite_radius",
        type: "real",
        defaultValue: "4.0",
      },
      {
        id: "param__collision_threshold",
        name: "Collision Threshold",
        variableName: "collision_threshold",
        type: "real",
        defaultValue: "10.0",
      },
      {
        id: "param__crash_threshold",
        name: "Crash Threshold",
        variableName: "crash_threshold",
        type: "real",
        defaultValue: "5.0",
      },
      {
        id: "param__gravitational_constant",
        name: "Gravitational Constant",
        variableName: "gravitational_constant",
        type: "real",
        defaultValue: "400000.0",
      },
    ],
  },
};

export const Satellites: Story = {
  name: "Satellites model",
  render: () => (
    <Frame context={SATELLITES_NET}>
      <CreateScenarioForm />
    </Frame>
  ),
};
