/**
 * P9: what the panel's document revision ignores. The panel's revision is
 * `hashPetrinautDocument(definition, { exclude: ["layout"] })`
 * (`libs/@hashintel/brunch-agent/src/ui/tools/shared/document-revision.ts`).
 * Which purely visual edits still move it?
 */
import { describe, expect, test } from "vitest";

import { hashPetrinautDocument, type SDCPN } from "@hashintel/petrinaut-core";

const revisionOf = (definition: SDCPN) =>
  hashPetrinautDocument(definition, { exclude: ["layout"] });

type Place = SDCPN["places"][number];
type Color = SDCPN["types"][number];
type Instance = NonNullable<SDCPN["componentInstances"]>[number];

type Overrides = {
  readonly place?: Partial<Place>;
  readonly type?: Partial<Color>;
  readonly instance?: Partial<Instance>;
  readonly innerPlace?: Partial<Place>;
  readonly net?: Partial<SDCPN>;
};

const place: Place = {
  id: "place-dryer",
  name: "Dryer",
  colorId: "type-load",
  dynamicsEnabled: false,
  differentialEquationId: null,
  x: 0,
  y: 0,
};

/** A small net with a type, a component instance and a subnet, each with one edit applied. */
const net = (overrides: Overrides = {}): SDCPN => ({
  places: [{ ...place, ...overrides.place }],
  transitions: [],
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
      subnetId: "subnet-1",
      parameterValues: {},
      x: 0,
      y: 0,
      ...overrides.instance,
    },
  ],
  subnets: [
    {
      id: "subnet-1",
      name: "Line",
      places: [{ ...place, id: "place-inner", ...overrides.innerPlace }],
      transitions: [],
      types: [],
      differentialEquations: [],
      parameters: [],
    },
  ],
  ...overrides.net,
});

const edits: Record<string, Overrides> = {
  "move a place": { place: { x: 120 } },
  "move a component instance": { instance: { y: 80 } },
  "move a place inside a subnet": { innerPlace: { x: 40 } },
  "recolour a type": { type: { displayColor: "#00FF00" } },
  "change a type's icon": { type: { iconSlug: "square" } },
  "add a place visualiser": {
    place: { visualizerCode: "return <Visualizer.Svg />;" },
  },
  "toggle a place's initial-state view": {
    place: { showAsInitialState: true },
  },
  "edit a description": { place: { description: "Dries clothes." } },
  "edit the net's host metadata": { net: { metadata: { note: "x" } } },
};

describe("P9: the panel's revision under visual-only edits", () => {
  test("only canvas positions are ignored; colours, icons, visualisers and the initial-state hint move it", () => {
    const before = revisionOf(net());
    const moved = Object.fromEntries(
      Object.entries(edits).map(([name, overrides]) => [
        name,
        revisionOf(net(overrides)) !== before,
      ]),
    );
    expect(moved).toEqual({
      "move a place": false,
      "move a component instance": false,
      "move a place inside a subnet": false,
      "recolour a type": true,
      "change a type's icon": true,
      "add a place visualiser": true,
      "toggle a place's initial-state view": true,
      "edit a description": true,
      "edit the net's host metadata": true,
    });
  });
});
