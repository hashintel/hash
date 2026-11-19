import { PetrinautStoryProvider } from "./petrinaut-story-provider";

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

const ArcConnectionsEditor = ({
  readonly = false,
  withSubnet = false,
}: {
  readonly?: boolean;
  withSubnet?: boolean;
}) => (
  <div style={{ height: "100vh", width: "100vw" }}>
    <PetrinautStoryProvider
      initialTitle="Arc connections"
      initialDefinition={withSubnet ? definitionWithSubnet : definition}
      readonly={readonly}
    />
  </div>
);

const meta = {
  title: "Petrinaut/Arc connections",
  parameters: { layout: "fullscreen" },
  component: ArcConnectionsEditor,
} satisfies Meta<typeof ArcConnectionsEditor>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Editable: Story = {};
export const ReadOnly: Story = { args: { readonly: true } };
export const WithSubnet: Story = { args: { withSubnet: true } };
