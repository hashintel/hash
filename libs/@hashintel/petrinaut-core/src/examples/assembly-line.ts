import { instantiateLibraryComponent } from "../composition/component-library";
import {
  standardComponentLibrary,
  standardComponentLibraryId,
} from "../composition/standard-components";
import { GRID_SIZE } from "../grid-size";

import type { ComponentInstance, Place, SDCPN } from "../types/sdcpn";

/**
 * Assembly Line — a net composed from standard components and place fusion:
 * a Source of parts feeds a Cutter stage, whose output is the root net's
 * Buffer place (capacity 5), which a Drill stage empties into Finished.
 *
 * Parts.Out and Cutter.In are fused port to port: the fused place exists only
 * inside the composition. Buffer is fused with Cutter.Out and Drill.In, so it
 * is a place of the root net that two components share, with its own
 * capacity and marking; Finished is fused with Drill.Out the same way, so the
 * Finished parts metric can count it.
 *
 * A Buffer that fills up blocks Cutter.Process, as a full place blocks any
 * transition feeding it, which is what makes the cut and drill rates worth
 * sweeping against each other.
 */
const componentById = new Map(
  standardComponentLibrary.components.map((component) => [
    component.id,
    component,
  ]),
);

const subnetFor = (componentId: string) =>
  instantiateLibraryComponent(
    standardComponentLibraryId,
    componentById.get(componentId)!,
  );

const sourceSubnet = subnetFor("source");
const stageSubnet = subnetFor("stage");

const localId = (subnet: { places: Place[] }, name: string): string =>
  subnet.places.find((place) => place.name === name)!.id;

const parameterId = (
  subnet: { parameters: { id: string; variableName: string }[] },
  variableName: string,
): string =>
  subnet.parameters.find(
    (parameter) => parameter.variableName === variableName,
  )!.id;

const instance = (
  id: string,
  name: string,
  subnetId: string,
  parameterValues: Record<string, string>,
  x: number,
  y: number,
  description: string,
): ComponentInstance => ({
  id,
  name,
  description,
  subnetId,
  parameterValues,
  x: x * GRID_SIZE,
  y: y * GRID_SIZE,
});

export const assemblyLine: { title: string; petriNetDefinition: SDCPN } = {
  title: "Assembly Line",
  petriNetDefinition: {
    description:
      "A line built from standard components: a Source of parts, a Cutter stage and a Drill stage joined by place fusion. The Buffer between the stages is a root place with a capacity of 5, so a slow drill backs the cutter up.",
    places: [
      {
        id: "place__buffer",
        name: "Buffer",
        description:
          "Cut parts waiting for the drill: fused with Cutter.Out and Drill.In. Its capacity of 5 blocks the cutter when the drill falls behind.",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        capacity: 5,
        showAsInitialState: true,
        x: 10 * GRID_SIZE,
        y: 0,
      },
      {
        id: "place__finished",
        name: "Finished",
        description: "Drilled parts, fused with Drill.Out: the line's output.",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 40 * GRID_SIZE,
        y: 0,
      },
    ],
    transitions: [],
    types: [],
    differentialEquations: [],
    parameters: [],
    subnets: [sourceSubnet, stageSubnet],
    componentInstances: [
      instance(
        "instance__parts",
        "Parts",
        sourceSubnet.id,
        { [parameterId(sourceSubnet, "rate")]: "1.5" },
        -24,
        0,
        "Raw parts arrive at 1.5 per time unit.",
      ),
      instance(
        "instance__cutter",
        "Cutter",
        stageSubnet.id,
        { [parameterId(stageSubnet, "rate")]: "2" },
        -6,
        0,
        "Cuts each part; stalls while the Buffer is full.",
      ),
      instance(
        "instance__drill",
        "Drill",
        stageSubnet.id,
        { [parameterId(stageSubnet, "rate")]: "1" },
        25,
        0,
        "Drills cut parts from the Buffer into Finished.",
      ),
    ],
    fusions: [
      {
        id: "fusion__parts_to_cutter",
        name: "RawParts",
        description: "Parts flow straight from the source into the cutter.",
        members: [
          {
            kind: "componentPort",
            componentInstanceId: "instance__parts",
            portPlaceId: localId(sourceSubnet, "Out"),
          },
          {
            kind: "componentPort",
            componentInstanceId: "instance__cutter",
            portPlaceId: localId(stageSubnet, "In"),
          },
        ],
      },
      {
        id: "fusion__buffer",
        members: [
          { kind: "place", placeId: "place__buffer" },
          {
            kind: "componentPort",
            componentInstanceId: "instance__cutter",
            portPlaceId: localId(stageSubnet, "Out"),
          },
          {
            kind: "componentPort",
            componentInstanceId: "instance__drill",
            portPlaceId: localId(stageSubnet, "In"),
          },
        ],
      },
      {
        id: "fusion__finished",
        members: [
          { kind: "place", placeId: "place__finished" },
          {
            kind: "componentPort",
            componentInstanceId: "instance__drill",
            portPlaceId: localId(stageSubnet, "Out"),
          },
        ],
      },
    ],
    metrics: [
      {
        id: "metric__finished",
        name: "Finished parts",
        description: "Parts that have been cut and drilled.",
        code: "return state.places.Finished.count;",
      },
      {
        id: "metric__buffer",
        name: "Buffer fill",
        description: "Cut parts waiting for the drill, out of a capacity of 5.",
        code: "return state.places.Buffer.count;",
      },
    ],
  },
};
