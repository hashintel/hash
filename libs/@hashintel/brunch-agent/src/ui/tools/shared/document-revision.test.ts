import { describe, expect, test } from "vitest";

import { documentRevisionOf } from "./document-revision";

import type {
  Color,
  Component,
  ComponentInstance,
  Place,
  SDCPN,
  Transition,
} from "@hashintel/petrinaut-core";

type NetOverrides = {
  readonly place?: Partial<Place>;
  readonly transition?: Partial<Transition>;
  readonly type?: Partial<Color>;
  readonly instance?: Partial<ComponentInstance>;
  readonly component?: Partial<Component>;
  readonly innerPlace?: Partial<Place>;
  readonly net?: Partial<SDCPN>;
};

const basePlace: Place = {
  id: "place-dryer",
  name: "Dryer",
  colorId: "type-load",
  dynamicsEnabled: false,
  x: 0,
  y: 0,
};

const makeNet = (overrides: NetOverrides = {}): SDCPN => ({
  places: [{ ...basePlace, ...overrides.place }],
  transitions: [
    {
      id: "transition-dry",
      name: "Dry",
      inputArcs: [{ placeId: "place-dryer", weight: 1, type: "standard" }],
      outputArcs: [],
      lambdaType: "stochastic",
      lambdaCode: "return 1;",
      transitionKernelCode: "",
      x: 100,
      y: 0,
      ...overrides.transition,
    },
  ],
  types: [
    {
      id: "type-load",
      name: "Load",
      iconSlug: "circle",
      displayColor: "#FF0000",
      elements: [],
      ...overrides.type,
    },
  ],
  differentialEquations: [],
  parameters: [],
  componentInstances: [
    {
      id: "instance-1",
      name: "Line",
      component: { id: "component-1" },
      parameterValues: {},
      x: 0,
      y: 0,
      ...overrides.instance,
    },
  ],
  components: [
    {
      id: "component-1",
      name: "Line",
      places: [{ ...basePlace, id: "place-inner", ...overrides.innerPlace }],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
      ...overrides.component,
    },
  ],
  ...overrides.net,
});

describe("documentRevisionOf", () => {
  const before = documentRevisionOf(makeNet());

  test.each<[string, NetOverrides]>([
    ["move a place", { place: { x: 120, y: 40 } }],
    ["move a transition", { transition: { x: 240 } }],
    ["move a component instance", { instance: { y: 80 } }],
    ["move a place inside a component", { innerPlace: { x: 40 } }],
    ["recolour a type", { type: { displayColor: "#00FF00" } }],
    ["change a type's icon", { type: { iconSlug: "square" } }],
    [
      "style a component's icon and colour",
      { component: { iconSvg: "<svg/>", displayColor: "#0000FF" } },
    ],
    [
      "add a place visualiser",
      { place: { visualizerCode: "return <Visualizer.Svg />;" } },
    ],
    [
      "show a place in the initial-state form",
      { place: { showAsInitialState: true } },
    ],
    [
      "hide a place from the initial-state form",
      { place: { showAsInitialState: false } },
    ],
    [
      "toggle a component place's initial-state hint",
      { innerPlace: { showAsInitialState: true } },
    ],
    ["edit a description", { place: { description: "Dries clothes." } }],
    ["edit the net's host metadata", { net: { metadata: { note: "x" } } }],
  ])("ignores non-semantic edit: %s", (_label, overrides) => {
    expect(documentRevisionOf(makeNet(overrides))).toBe(before);
  });

  test.each<[string, NetOverrides]>([
    ["rename a place", { place: { name: "Tumbler" } }],
    [
      "edit transition lambda code",
      { transition: { lambdaCode: "return 2;" } },
    ],
  ])("moves on semantic edit: %s", (_label, overrides) => {
    expect(documentRevisionOf(makeNet(overrides))).not.toBe(before);
  });
});
