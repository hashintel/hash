import { useState } from "react";

import { AdHocScenarioForm } from "./ad-hoc-scenario-form";
import { EMPTY_AD_HOC_STATE } from "./state";

import type {
  AdHocScenarioState,
  AdHocSynthesisContext,
} from "@hashintel/petrinaut-core";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Components / AdHocScenarioForm",
  parameters: {
    layout: "padded",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const context: AdHocSynthesisContext = {
  netParameters: [
    {
      id: "param-rate",
      name: "Failure rate",
      variableName: "failure_rate",
      type: "real",
      defaultValue: "0.02",
    },
    {
      id: "param-crews",
      name: "Repair crews",
      variableName: "repair_crews",
      type: "integer",
      defaultValue: "3",
    },
  ],
  places: [
    {
      id: "place-trucks",
      name: "Trucks",
      colorId: "colour-truck",
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
    {
      id: "place-depot",
      name: "Depot",
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
      x: 0,
      y: 0,
    },
  ],
  types: [
    {
      id: "colour-truck",
      name: "Truck",
      iconSlug: "circle",
      displayColor: "#3676b8",
      elements: [
        { elementId: "e1", name: "mileage", type: "real" },
        { elementId: "e2", name: "age", type: "integer" },
        { elementId: "e3", name: "inService", type: "boolean" },
      ],
    },
  ],
};

const initialState: AdHocScenarioState = {
  variables: [
    {
      name: "fleetMileage",
      type: "real",
      expression: "120000",
      optimize: null,
    },
  ],
  netParameters: [],
  places: {
    "place-trucks": {
      kind: "coloured",
      variables: [],
      rows: [
        {
          kind: "fixed",
          cells: [
            { expression: "fleetMileage", optimize: null },
            { expression: "3", optimize: null },
            { expression: "true", optimize: null },
          ],
        },
        {
          kind: "template",
          count: { expression: "5", optimize: null },
          cells: [
            { expression: "fleetMileage + i * 10000", optimize: null },
            { expression: "i", optimize: null },
            { expression: "true", optimize: null },
          ],
        },
      ],
      sharedColumns: {},
    },
    "place-depot": {
      kind: "uncoloured",
      count: { expression: "parameters.repair_crews", optimize: null },
    },
  },
};

const Demo: React.FC<{ optimizable: boolean }> = ({ optimizable }) => {
  const [state, setState] = useState(initialState);
  return (
    <div style={{ width: 720 }}>
      <AdHocScenarioForm
        state={state}
        onChange={setState}
        context={context}
        optimizable={optimizable}
      />
    </div>
  );
};

export const ForOptimization: Story = {
  render: () => <Demo optimizable />,
};

export const ForPlainRuns: Story = {
  render: () => <Demo optimizable={false} />,
};

const EmptyDemo: React.FC = () => {
  const [state, setState] = useState(EMPTY_AD_HOC_STATE);
  return (
    <div style={{ width: 720 }}>
      <AdHocScenarioForm
        state={state}
        onChange={setState}
        context={context}
        optimizable
      />
    </div>
  );
};

export const Empty: Story = {
  render: () => <EmptyDemo />,
};
