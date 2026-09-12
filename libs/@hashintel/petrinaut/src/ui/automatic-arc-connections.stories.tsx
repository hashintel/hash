import { use, useState } from "react";

import { UserSettingsContext } from "../react/state/user-settings-context";
import { UserSettingsProvider } from "../react/state/user-settings-provider";
import { PetrinautStoryProvider } from "./petrinaut-story-provider";

import type { AutomaticArcRendering } from "../react/state/user-settings-context";
import type { SDCPN } from "@hashintel/petrinaut-core";
import type { Meta, StoryObj } from "@storybook/react-vite";

const definition: SDCPN = {
  places: [
    { id: "waiting", name: "Waiting", x: 0, y: 0 },
    { id: "staff", name: "Free staff", x: 0, y: 240 },
    { id: "serving", name: "Serving", x: 460, y: 0 },
    { id: "served", name: "Served", x: 920, y: 0 },
  ].map((place) => ({
    ...place,
    colorId: null,
    dynamicsEnabled: false,
    differentialEquationId: null,
  })),
  transitions: [
    {
      id: "begin",
      name: "Begin service",
      x: 230,
      y: 140,
      inputArcs: [
        { placeId: "waiting", weight: 2, type: "standard" },
        { placeId: "staff", weight: 1, type: "read" },
      ],
      outputArcs: [{ placeId: "serving", weight: 1 }],
      lambdaType: "predicate",
      lambdaCode: "return true;",
      transitionKernelCode: "return {};",
    },
    {
      id: "finish",
      name: "Finish service",
      x: 690,
      y: 140,
      inputArcs: [
        { placeId: "serving", weight: 1, type: "standard" },
        { placeId: "served", weight: 3, type: "inhibitor" },
      ],
      outputArcs: [
        { placeId: "served", weight: 1 },
        { placeId: "staff", weight: 1 },
      ],
      lambdaType: "predicate",
      lambdaCode: "return true;",
      transitionKernelCode: "return {};",
    },
  ],
  types: [],
  parameters: [],
  differentialEquations: [],
};

const definitionWithSubnet: SDCPN = {
  ...definition,
  transitions: definition.transitions.map((transition) =>
    transition.id === "finish"
      ? {
          ...transition,
          outputArcs: [
            ...transition.outputArcs,
            {
              endpoint: {
                kind: "componentPort",
                componentInstanceId: "archive",
                portPlaceId: "inbox",
              },
              weight: 1,
            },
          ],
        }
      : transition,
  ),
  componentInstances: [
    {
      id: "archive",
      name: "Archive",
      subnetId: "archive-subnet",
      parameterValues: {},
      x: 920,
      y: 320,
    },
  ],
  subnets: [
    {
      id: "archive-subnet",
      name: "Archive subnet",
      places: [
        {
          id: "inbox",
          name: "Inbox",
          isPort: true,
          colorId: null,
          dynamicsEnabled: false,
          differentialEquationId: null,
          x: 0,
          y: 0,
        },
      ],
      transitions: [],
      types: [],
      parameters: [],
      differentialEquations: [],
    },
  ],
};

const definitionWithObstacles: SDCPN = {
  ...definition,
  places: [
    ...definition.places.map((place) => ({
      ...place,
      x: place.id === "serving" || place.id === "served" ? 860 : 0,
      y: place.id === "staff" || place.id === "served" ? 280 : 0,
    })),
    {
      id: "obstacle",
      name: "Obstacle",
      x: 280,
      y: 0,
      colorId: null,
      dynamicsEnabled: false,
      differentialEquationId: null,
    },
  ],
  transitions: definition.transitions.map((transition) => ({
    ...transition,
    x: 560,
    y: transition.id === "begin" ? 0 : 280,
  })),
};

const AutomaticArcEditor = ({
  readonly = false,
  withSubnet = false,
  withObstacles = false,
  initialArcShape,
}: {
  readonly?: boolean;
  withSubnet?: boolean;
  withObstacles?: boolean;
  initialArcShape?: AutomaticArcRendering;
}) => {
  const settings = use(UserSettingsContext);
  const [automaticArcs, setAutomaticArcs] = useState(true);
  const [arcShape, setArcShape] = useState(
    initialArcShape ?? settings.automaticArcRendering,
  );
  return (
    <UserSettingsContext
      value={{
        ...settings,
        enableAutomaticArcConnections: automaticArcs,
        setEnableAutomaticArcConnections: setAutomaticArcs,
        automaticArcRendering: arcShape,
        setAutomaticArcRendering: setArcShape,
      }}
    >
      <PetrinautStoryProvider
        initialTitle="Automatic arc connections"
        initialDefinition={
          withObstacles
            ? definitionWithObstacles
            : withSubnet
              ? definitionWithSubnet
              : definition
        }
        readonly={readonly}
      />
    </UserSettingsContext>
  );
};

const meta = {
  title: "Petrinaut/Automatic arc connections",
  parameters: { layout: "fullscreen" },
  render: (args) => (
    <div style={{ height: "100vh", width: "100vw" }}>
      <UserSettingsProvider>
        <AutomaticArcEditor {...args} />
      </UserSettingsProvider>
    </div>
  ),
} satisfies Meta<typeof AutomaticArcEditor>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Editable: Story = {};
export const ReadOnly: Story = { args: { readonly: true } };
export const WithSubnet: Story = { args: { withSubnet: true } };

export const Square: Story = { args: { initialArcShape: "square" } };
export const SquareWithObstacles: Story = {
  args: { initialArcShape: "square", withObstacles: true },
};
