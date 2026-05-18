import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useState,
} from "react";

import type {
  Color,
  DifferentialEquation,
  Parameter,
  Place,
  Transition,
} from "@hashintel/petrinaut-core";
import { MonacoProvider } from "../../../../monaco/provider";
import {
  SDCPNContext,
  type SDCPNContextValue,
} from "../../../../../react/state/sdcpn-context";
import type { MutationContextValue } from "../../../../../react/state/mutation-context";
import { DifferentialEquationProperties } from "./differential-equation-properties/main";
import { ParameterProperties } from "./parameter-properties/main";
import { PlaceProperties } from "./place-properties/main";
import { TransitionProperties } from "./transition-properties/main";
import { TypeProperties } from "./type-properties/main";

// ---------------------------------------------------------------------------
// Fake data
// ---------------------------------------------------------------------------

const TYPES: Color[] = [
  {
    id: "type-1",
    name: "Protein",
    iconSlug: "circle",
    displayColor: "#FF6B35",
    elements: [
      { elementId: "elem-1", name: "concentration", type: "real" },
      { elementId: "elem-2", name: "temperature", type: "real" },
    ],
  },
  {
    id: "type-2",
    name: "Chemical",
    iconSlug: "circle",
    displayColor: "#7B68EE",
    elements: [{ elementId: "elem-3", name: "amount", type: "real" }],
  },
];

const DIFF_EQS: DifferentialEquation[] = [
  {
    id: "eq-1",
    name: "Decay Equation",
    colorId: "type-1",
    code: [
      "function compute(state: { concentration: number; temperature: number }, dt: number) {",
      "  return {",
      "    concentration: state.concentration * -0.1 * dt,",
      "    temperature: 0,",
      "  };",
      "}",
    ].join("\n"),
  },
  {
    id: "eq-2",
    name: "Growth Equation",
    colorId: "type-1",
    code: [
      "function compute(state: { concentration: number; temperature: number }, dt: number) {",
      "  return {",
      "    concentration: state.concentration * 0.05 * dt,",
      "    temperature: 0,",
      "  };",
      "}",
    ].join("\n"),
  },
];

const PLACES: Place[] = [
  {
    id: "place-1",
    name: "PlantASupply",
    colorId: "type-1",
    dynamicsEnabled: true,
    differentialEquationId: "eq-1",
    x: 100,
    y: 100,
  },
  {
    id: "place-2",
    name: "Warehouse",
    colorId: "type-2",
    dynamicsEnabled: false,
    differentialEquationId: null,
    x: 300,
    y: 100,
  },
  {
    id: "place-3",
    name: "Output",
    colorId: null,
    dynamicsEnabled: false,
    differentialEquationId: null,
    x: 500,
    y: 100,
  },
];

const TRANSITION: Transition = {
  id: "transition-1",
  name: "ProcessOrder",
  inputArcs: [
    { placeId: "place-1", weight: 1, type: "standard" },
    { placeId: "place-2", weight: 2, type: "standard" },
  ],
  outputArcs: [{ placeId: "place-3", weight: 1 }],
  lambdaType: "predicate",
  lambdaCode: "function predicate(inputs) {\n  return true;\n}",
  transitionKernelCode: "function kernel(inputs) {\n  return inputs;\n}",
  x: 200,
  y: 100,
};

const PARAMETER: Parameter = {
  id: "param-1",
  name: "Reaction Rate",
  variableName: "reaction_rate",
  type: "real",
  defaultValue: "0.5",
};

// ---------------------------------------------------------------------------
// Stub SDCPN context (provides fake petriNetDefinition so panels can read
// types / differential equations from the net).
// EditorContext, SimulationContext, and PlaybackContext all have sensible
// createContext() defaults so they don't need explicit providers here.
// ---------------------------------------------------------------------------

const SDCPN_STUB: SDCPNContextValue = {
  createNewNet: () => {},
  existingNets: [],
  loadPetriNet: () => {},
  petriNetId: "story-net",
  petriNetDefinition: {
    places: PLACES,
    transitions: [TRANSITION],
    types: TYPES,
    differentialEquations: DIFF_EQS,
    parameters: [PARAMETER],
  },
  readonly: false,
  setTitle: () => {},
  title: "Story Net",
  getItemType: () => null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Deep-clone story state so local Storybook updates mimic app mutations. */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function applyStoryUpdate<T>(
  setValue: Dispatch<SetStateAction<T>>,
  update: Partial<T>,
): void {
  setValue((prev) => ({ ...clone(prev), ...clone(update) }));
}

/** Wraps panel content with the required contexts, filling the viewport. */
const PanelFrame = ({ children }: { children: ReactNode }) => (
  <MonacoProvider>
    <SDCPNContext value={SDCPN_STUB}>
      <div
        style={{
          width: "100%",
          height: "100vh",
          display: "flex",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {children}
        </div>
      </div>
    </SDCPNContext>
  </MonacoProvider>
);

// ---------------------------------------------------------------------------
// Interactive story components (manage local state)
// ---------------------------------------------------------------------------

const PlacePanelStory = () => {
  const [place, setPlace] = useState<Place>(PLACES[0]!);
  const updatePlace: MutationContextValue["updatePlace"] = (input) => {
    applyStoryUpdate(setPlace, input.update);
  };
  return (
    <PanelFrame>
      <PlaceProperties place={place} types={TYPES} updatePlace={updatePlace} />
    </PanelFrame>
  );
};

const PlaceEmptyPanelStory = () => {
  const [place, setPlace] = useState<Place>({
    id: "place-empty",
    name: "NewPlace",
    colorId: null,
    dynamicsEnabled: false,
    differentialEquationId: null,
    x: 0,
    y: 0,
  });
  const updatePlace: MutationContextValue["updatePlace"] = (input) => {
    applyStoryUpdate(setPlace, input.update);
  };
  return (
    <PanelFrame>
      <PlaceProperties place={place} types={TYPES} updatePlace={updatePlace} />
    </PanelFrame>
  );
};

const TransitionPanelStory = () => {
  const [transition, setTransition] = useState<Transition>(TRANSITION);
  const updateTransition: MutationContextValue["updateTransition"] = (
    input,
  ) => {
    applyStoryUpdate(setTransition, input.update);
  };
  const updateArcWeight: MutationContextValue["updateArcWeight"] = (input) => {
    setTransition((prev) => {
      const next = clone(prev);
      const arcs =
        input.arcDirection === "input" ? next.inputArcs : next.outputArcs;
      const arc = arcs.find((item) => item.placeId === input.placeId);
      if (arc) {
        arc.weight = input.weight;
      }
      return next;
    });
  };
  const updateArcPlace: MutationContextValue["updateArcPlace"] = (input) => {
    setTransition((prev) => {
      const next = clone(prev);
      const arcs =
        input.arcDirection === "input" ? next.inputArcs : next.outputArcs;
      const arc = arcs.find((item) => item.placeId === input.oldPlaceId);
      if (arc) {
        arc.placeId = input.newPlaceId;
      }
      return next;
    });
  };
  const removeArc: MutationContextValue["removeArc"] = (input) => {
    setTransition((prev) => {
      const next = clone(prev);
      const arcs =
        input.arcDirection === "input" ? next.inputArcs : next.outputArcs;
      const index = arcs.findIndex((arc) => arc.placeId === input.placeId);
      if (index !== -1) {
        arcs.splice(index, 1);
      }
      return next;
    });
  };
  return (
    <PanelFrame>
      <TransitionProperties
        transition={transition}
        places={PLACES}
        types={TYPES}
        updateTransition={updateTransition}
        onArcWeightUpdate={updateArcWeight}
        updateArcPlace={updateArcPlace}
        removeArc={removeArc}
      />
    </PanelFrame>
  );
};

const TransitionEmptyPanelStory = () => {
  const [transition, setTransition] = useState<Transition>({
    id: "transition-empty",
    name: "NewTransition",
    inputArcs: [],
    outputArcs: [],
    lambdaType: "predicate",
    lambdaCode: "",
    transitionKernelCode: "",
    x: 0,
    y: 0,
  });
  const updateTransition: MutationContextValue["updateTransition"] = (
    input,
  ) => {
    applyStoryUpdate(setTransition, input.update);
  };
  return (
    <PanelFrame>
      <TransitionProperties
        transition={transition}
        places={PLACES}
        types={TYPES}
        updateTransition={updateTransition}
        onArcWeightUpdate={() => {}}
        updateArcPlace={() => {}}
        removeArc={() => {}}
      />
    </PanelFrame>
  );
};

const TypePanelStory = () => {
  const [type, setType] = useState<Color>(TYPES[0]!);
  const updateType: MutationContextValue["updateType"] = (input) => {
    applyStoryUpdate(setType, input.update);
  };
  const addTypeElement: MutationContextValue["addTypeElement"] = (input) => {
    setType((prev) => {
      const next = clone(prev);
      next.elements.push(clone(input.element));
      return next;
    });
  };
  const updateTypeElement: MutationContextValue["updateTypeElement"] = (
    input,
  ) => {
    setType((prev) => {
      const next = clone(prev);
      const element = next.elements.find(
        (item) => item.elementId === input.elementId,
      );
      if (element) {
        Object.assign(element, clone(input.update));
      }
      return next;
    });
  };
  const removeTypeElement: MutationContextValue["removeTypeElement"] = (
    input,
  ) => {
    setType((prev) => ({
      ...clone(prev),
      elements: prev.elements.filter(
        (element) => element.elementId !== input.elementId,
      ),
    }));
  };
  const moveTypeElement: MutationContextValue["moveTypeElement"] = (input) => {
    setType((prev) => {
      const next = clone(prev);
      const fromIndex = next.elements.findIndex(
        (element) => element.elementId === input.elementId,
      );
      if (fromIndex !== -1) {
        const [element] = next.elements.splice(fromIndex, 1);
        if (element) {
          next.elements.splice(input.toIndex, 0, element);
        }
      }
      return next;
    });
  };
  return (
    <PanelFrame>
      <TypeProperties
        type={type}
        updateType={updateType}
        addTypeElement={addTypeElement}
        updateTypeElement={updateTypeElement}
        removeTypeElement={removeTypeElement}
        moveTypeElement={moveTypeElement}
      />
    </PanelFrame>
  );
};

const ParameterPanelStory = () => {
  const [parameter, setParameter] = useState<Parameter>(PARAMETER);
  const updateParameter: MutationContextValue["updateParameter"] = (input) => {
    applyStoryUpdate(setParameter, input.update);
  };
  return (
    <PanelFrame>
      <ParameterProperties
        parameter={parameter}
        updateParameter={updateParameter}
      />
    </PanelFrame>
  );
};

const DifferentialEquationPanelStory = () => {
  const [diffEq, setDiffEq] = useState<DifferentialEquation>(DIFF_EQS[0]!);
  const updateDiffEq: MutationContextValue["updateDifferentialEquation"] = (
    input,
  ) => {
    applyStoryUpdate(setDiffEq, input.update);
  };
  return (
    <PanelFrame>
      <DifferentialEquationProperties
        differentialEquation={diffEq}
        types={TYPES}
        places={PLACES}
        updateDifferentialEquation={updateDiffEq}
      />
    </PanelFrame>
  );
};

// ---------------------------------------------------------------------------
// Storybook
// ---------------------------------------------------------------------------

const meta = {
  title: "Panels / Properties Panel",
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const PlaceWithType: Story = {
  name: "Place (with type & dynamics)",
  render: () => <PlacePanelStory />,
};

export const PlaceEmpty: Story = {
  name: "Place (no type)",
  render: () => <PlaceEmptyPanelStory />,
};

export const TransitionWithArcs: Story = {
  name: "Transition (with arcs)",
  render: () => <TransitionPanelStory />,
};

export const TransitionEmpty: Story = {
  name: "Transition (empty)",
  render: () => <TransitionEmptyPanelStory />,
};

export const Type: Story = {
  name: "Type",
  render: () => <TypePanelStory />,
};

export const ParameterPanel: Story = {
  name: "Parameter",
  render: () => <ParameterPanelStory />,
};

export const DifferentialEquationPanel: Story = {
  name: "Differential Equation",
  render: () => <DifferentialEquationPanelStory />,
};
