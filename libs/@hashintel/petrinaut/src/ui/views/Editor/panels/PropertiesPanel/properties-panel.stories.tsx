import { useEffect, useState } from "react";
import { expect, userEvent, within } from "storybook/test";

import {
  createJsonDocHandle,
  createPetrinaut,
  type Color,
  type DifferentialEquation,
  type Parameter,
  type Place,
  type SelectionItem,
  type Transition,
} from "@hashintel/petrinaut-core";

import {
  defaultPetrinautNavigationState,
  type PetrinautNavigationState,
} from "../../../../../react/navigation";
import { PetrinautProvider } from "../../../../../react/petrinaut-provider";
import { VerticalSubViewsContainer } from "../../../../components/sub-view/vertical/vertical-sub-views-container";
import { MonacoProvider } from "../../../../monaco/provider";
import { entitiesTreeSubView } from "../LeftSideBar/subviews/entities-tree";
import { SelectedItemProperties } from "./selected-item-properties";

import type { Meta, StoryObj } from "@storybook/react-vite";

const types: Color[] = [
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

const differentialEquations: DifferentialEquation[] = [
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

const places: Place[] = [
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

const transition: Transition = {
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

const parameter: Parameter = {
  id: "param-1",
  name: "Reaction Rate",
  variableName: "reaction_rate",
  type: "real",
  defaultValue: "0.5",
};

const emptyPlace: Place = {
  id: "place-empty",
  name: "NewPlace",
  colorId: null,
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
};

const emptyTransition: Transition = {
  id: "transition-empty",
  name: "NewTransition",
  inputArcs: [],
  outputArcs: [],
  lambdaType: "predicate",
  lambdaCode: "",
  transitionKernelCode: "",
  x: 0,
  y: 0,
};

const PropertiesPanelStory = ({
  selection,
  showSidebar = false,
}: {
  selection: SelectionItem;
  showSidebar?: boolean;
}) => {
  const [instance] = useState(() =>
    createPetrinaut({
      document: createJsonDocHandle({
        id: "properties-panel-story",
        initial: {
          places: [...places, emptyPlace],
          transitions: [transition, emptyTransition],
          types,
          differentialEquations,
          parameters: [parameter],
        },
      }),
    }),
  );
  const [navigationState, setNavigationState] =
    useState<PetrinautNavigationState>(() => ({
      ...defaultPetrinautNavigationState,
      selection: [selection],
    }));

  useEffect(() => () => instance.dispose(), [instance]);

  return (
    <PetrinautProvider
      instance={instance}
      netManagement={{
        title: "Story Net",
        existingNets: [],
        createNewNet: () => {},
        loadPetriNet: () => {},
      }}
      navigation={{ state: navigationState, onNavigate: setNavigationState }}
    >
      <MonacoProvider>
        <div
          style={{
            width: "100%",
            height: "100vh",
            display: "flex",
            overflow: "hidden",
          }}
        >
          {showSidebar && (
            <div style={{ width: 260, display: "flex", flexShrink: 0 }}>
              <VerticalSubViewsContainer
                name="properties-story-entities"
                subViews={[entitiesTreeSubView]}
              />
            </div>
          )}
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <SelectedItemProperties />
          </div>
        </div>
      </MonacoProvider>
    </PetrinautProvider>
  );
};

const meta = {
  title: "Panels / Properties Panel",
  component: PropertiesPanelStory,
  parameters: {
    layout: "fullscreen",
  },
  render: (args) => <PropertiesPanelStory key={args.selection.id} {...args} />,
} satisfies Meta<typeof PropertiesPanelStory>;

export default meta;

type Story = StoryObj<typeof meta>;

export const PlaceWithType: Story = {
  name: "Place (with type & dynamics)",
  args: { selection: { type: "place", id: "place-1" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("textbox", { name: "Name" }),
    ).toHaveValue("PlantASupply");
    for (const label of [
      "Component port",
      "Token capacity",
      "Default starting place",
    ]) {
      const checkbox = canvas.getByRole("checkbox", { name: label });
      await userEvent.click(canvas.getByText(label, { exact: true }));
      await expect(checkbox).toBeChecked();
      await userEvent.click(canvas.getByText(label, { exact: true }));
      await expect(checkbox).not.toBeChecked();
    }
  },
};

export const PlaceEmpty: Story = {
  name: "Place (no type)",
  args: { selection: { type: "place", id: "place-empty" } },
};

export const SidebarAndProperties: Story = {
  args: {
    selection: { type: "place", id: "place-1" },
    showSidebar: true,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const row = await canvas.findByRole("option", { name: "PlantASupply" });
    const label = within(row).getByText("PlantASupply");
    await expect(getComputedStyle(label).fontSize).toBe("14px");
    await expect(getComputedStyle(label).fontWeight).toBe("500");
    await expect(getComputedStyle(label).lineHeight).toBe("19.25px");
    await expect(row.getBoundingClientRect().height).toBe(32);
    await expect(getComputedStyle(row).padding).toBe("4px 4px 4px 20px");

    const sidebarHeader = canvas
      .getByText("Entities", { exact: true })
      .closest<HTMLElement>("[data-subview-header]")!;
    const propertyHeader = canvas
      .getByText("Place PlantASupply", { exact: true })
      .closest<HTMLElement>("[data-subview-header]")!;
    await expect(sidebarHeader.getBoundingClientRect().height).toBe(44);
    await expect(getComputedStyle(sidebarHeader).borderBottomColor).toBe(
      "rgba(0, 0, 0, 0.024)",
    );
    await expect(getComputedStyle(propertyHeader).borderBottomColor).toBe(
      "rgba(0, 0, 0, 0.09)",
    );
    const stateToggle = canvas.getByRole("button", {
      name: /^State\b/,
    });
    await expect(
      getComputedStyle(stateToggle.querySelector("[data-toggle-icon]")!)
        .opacity,
    ).toBe("1");
  },
};

export const TransitionWithArcs: Story = {
  name: "Transition (with arcs)",
  args: { selection: { type: "transition", id: "transition-1" } },
};

export const TransitionEmpty: Story = {
  name: "Transition (empty)",
  args: { selection: { type: "transition", id: "transition-empty" } },
};

export const Type: Story = {
  name: "Type",
  args: { selection: { type: "type", id: "type-1" } },
};

export const ParameterPanel: Story = {
  name: "Parameter",
  args: { selection: { type: "parameter", id: "param-1" } },
};

export const DifferentialEquationPanel: Story = {
  name: "Differential Equation",
  args: { selection: { type: "differentialEquation", id: "eq-1" } },
};
