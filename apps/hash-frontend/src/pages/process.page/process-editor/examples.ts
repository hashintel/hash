import type { Node } from "reactflow";

import type { PetriNetEdge } from "./edge-menu";
import type { TokenType } from "./token-editor";

export const exampleCPN = {
  tokenTypes: [
    { id: "precursor_a", name: "Precursor A", color: "#3498db" },
    { id: "precursor_b", name: "Precursor B", color: "#f1c40f" },
    { id: "drug", name: "Drug", color: "#2ecc71" },
    { id: "failed_drug", name: "Failed Drug", color: "#e74c3c" },
  ] satisfies TokenType[],
  nodes: [
    {
      id: "place_0",
      type: "place",
      position: { x: 20, y: 120 },
      data: {
        label: "Plant A Supply",
        tokenCounts: {
          precursor_a: 5,
          precursor_b: 0,
          drug: 0,
          failed_drug: 0,
        },
        tokenTypes: [
          { id: "precursor_a", name: "Precursor A", color: "#3498db" },
          { id: "precursor_b", name: "Precursor B", color: "#f1c40f" },
          { id: "drug", name: "Drug", color: "#2ecc71" },
          { id: "failed_drug", name: "Failed Drug", color: "#e74c3c" },
        ],
      },
    },
    {
      id: "place_1",
      type: "place",
      position: { x: 20, y: 600 },
      data: {
        label: "Plant B Supply",
        tokenCounts: {
          precursor_a: 0,
          precursor_b: 5,
          drug: 0,
          failed_drug: 0,
        },
        tokenTypes: [
          { id: "precursor_a", name: "Precursor A", color: "#3498db" },
          { id: "precursor_b", name: "Precursor B", color: "#f1c40f" },
          { id: "drug", name: "Drug", color: "#2ecc71" },
          { id: "failed_drug", name: "Failed Drug", color: "#e74c3c" },
        ],
      },
    },
    {
      id: "place_2",
      type: "place",
      position: { x: 300, y: 300 },
      data: {
        label: "Manufacturing Plant",
        tokenCounts: {
          precursor_a: 0,
          precursor_b: 0,
          drug: 0,
          failed_drug: 0,
        },
        tokenTypes: [
          { id: "precursor_a", name: "Precursor A", color: "#3498db" },
          { id: "precursor_b", name: "Precursor B", color: "#f1c40f" },
          { id: "drug", name: "Drug", color: "#2ecc71" },
          { id: "failed_drug", name: "Failed Drug", color: "#e74c3c" },
        ],
      },
    },
    {
      id: "place_3",
      type: "place",
      position: { x: 700, y: 350 },
      data: {
        label: "QA Queue",
        tokenCounts: {
          precursor_a: 0,
          precursor_b: 0,
          drug: 0,
          failed_drug: 0,
        },
        tokenTypes: [
          { id: "precursor_a", name: "Precursor A", color: "#3498db" },
          { id: "precursor_b", name: "Precursor B", color: "#f1c40f" },
          { id: "drug", name: "Drug", color: "#2ecc71" },
          { id: "failed_drug", name: "Failed Drug", color: "#e74c3c" },
        ],
      },
    },
    {
      id: "place_4",
      type: "place",
      position: { x: 1100, y: 600 },
      data: {
        label: "Disposal",
        tokenCounts: {
          precursor_a: 0,
          precursor_b: 0,
          drug: 0,
          failed_drug: 0,
        },
        tokenTypes: [
          { id: "precursor_a", name: "Precursor A", color: "#3498db" },
          { id: "precursor_b", name: "Precursor B", color: "#f1c40f" },
          { id: "drug", name: "Drug", color: "#2ecc71" },
          { id: "failed_drug", name: "Failed Drug", color: "#e74c3c" },
        ],
      },
    },
    {
      id: "place_5",
      type: "place",
      position: { x: 1000, y: 200 },
      data: {
        label: "Dispatch",
        tokenCounts: {
          precursor_a: 0,
          precursor_b: 0,
          drug: 0,
          failed_drug: 0,
        },
        tokenTypes: [
          { id: "precursor_a", name: "Precursor A", color: "#3498db" },
          { id: "precursor_b", name: "Precursor B", color: "#f1c40f" },
          { id: "drug", name: "Drug", color: "#2ecc71" },
          { id: "failed_drug", name: "Failed Drug", color: "#e74c3c" },
        ],
      },
    },
    {
      id: "place_6",
      type: "place",
      position: { x: 1300, y: 380 },
      data: {
        label: "Hospital",
        tokenCounts: {
          precursor_a: 0,
          precursor_b: 0,
          drug: 0,
          failed_drug: 0,
        },
        tokenTypes: [
          { id: "precursor_a", name: "Precursor A", color: "#3498db" },
          { id: "precursor_b", name: "Precursor B", color: "#f1c40f" },
          { id: "drug", name: "Drug", color: "#2ecc71" },
          { id: "failed_drug", name: "Failed Drug", color: "#e74c3c" },
        ],
      },
    },
    {
      id: "transition_0",
      type: "transition",
      position: { x: 100, y: 400 },
      data: {
        label: "Deliver to Plant",
        description: "Transport precursors to manufacturing plant",
        processTimes: {
          precursor_a: 2,
          precursor_b: 2,
          drug: 0,
          failed_drug: 0,
        },
        priority: 1,
      },
    },
    {
      id: "transition_1",
      type: "transition",
      position: { x: 490, y: 350 },
      data: {
        label: "Manufacture",
        description: "Combine precursors to create drug",
        processTimes: {
          precursor_a: 2,
          precursor_b: 3,
          drug: 0,
          failed_drug: 0,
        },
        priority: 1,
      },
    },
    {
      id: "transition_2",
      type: "transition",
      position: { x: 870, y: 400 },
      data: {
        label: "Quality Check",
        processTimes: { drug: 2 },
        description: "Quality assurance with conditional outputs",
        hasConditions: true,
        conditions: [
          {
            id: "condition-pass",
            name: "Pass",
            probability: 75,
            outputEdgeIds: ["transition_2-place_5"],
          },
          {
            id: "condition-fail",
            name: "Fail",
            probability: 25,
            outputEdgeIds: ["transition_2-place_4"],
          },
        ],
        priority: 2,
      },
    },
    {
      id: "transition_3",
      type: "transition",
      position: { x: 1150, y: 280 },
      data: {
        label: "Ship",
        description: "Ship drugs to hospital",
        processTimes: {
          precursor_a: 0,
          precursor_b: 0,
          drug: 3,
          failed_drug: 0,
        },
        priority: 1,
      },
    },
  ] satisfies Node[],
  edges: [
    {
      id: "place_0-transition_0",
      source: "place_0",
      target: "transition_0",
      type: "default",
      interactionWidth: 8,
      data: {
        tokenWeights: {
          precursor_a: 1,
          precursor_b: 0,
          drug: 0,
          failed_drug: 0,
        },
      },
    },
    {
      id: "place_1-transition_0",
      source: "place_1",
      target: "transition_0",
      type: "default",
      interactionWidth: 8,
      data: {
        tokenWeights: {
          precursor_a: 0,
          precursor_b: 1,
          drug: 0,
          failed_drug: 0,
        },
      },
    },
    {
      id: "transition_0-place_2",
      source: "transition_0",
      target: "place_2",
      type: "default",
      interactionWidth: 8,
      data: {
        tokenWeights: {
          precursor_a: 1,
          precursor_b: 1,
          drug: 0,
          failed_drug: 0,
        },
      },
    },
    {
      id: "place_2-transition_1",
      source: "place_2",
      target: "transition_1",
      type: "default",
      interactionWidth: 8,
      data: {
        tokenWeights: {
          precursor_a: 1,
          precursor_b: 1,
          drug: 0,
          failed_drug: 0,
        },
      },
    },
    {
      id: "transition_1-place_3",
      source: "transition_1",
      target: "place_3",
      type: "default",
      interactionWidth: 8,
      data: {
        tokenWeights: {
          precursor_a: 0,
          precursor_b: 0,
          drug: 1,
          failed_drug: 0,
        },
      },
    },
    {
      id: "place_3-transition_2",
      source: "place_3",
      target: "transition_2",
      type: "default",
      interactionWidth: 8,
      data: {
        tokenWeights: {
          precursor_a: 0,
          precursor_b: 0,
          drug: 1,
          failed_drug: 0,
        },
      },
    },
    {
      id: "transition_2-place_5",
      source: "transition_2",
      target: "place_5",
      type: "default",
      interactionWidth: 8,
      data: {
        tokenWeights: {
          precursor_a: 0,
          precursor_b: 0,
          drug: 1,
          failed_drug: 0,
        },
      },
    },
    {
      id: "transition_2-place_4",
      source: "transition_2",
      target: "place_4",
      type: "default",
      interactionWidth: 8,
      data: {
        tokenWeights: {
          precursor_a: 0,
          precursor_b: 0,
          drug: 0,
          failed_drug: 1,
        },
      },
    },
    {
      id: "place_5-transition_3",
      source: "place_5",
      target: "transition_3",
      type: "default",
      interactionWidth: 8,
      data: {
        tokenWeights: {
          precursor_a: 0,
          precursor_b: 0,
          drug: 1,
          failed_drug: 0,
        },
      },
    },
    {
      id: "transition_3-place_6",
      source: "transition_3",
      target: "place_6",
      type: "default",
      interactionWidth: 8,
      data: {
        tokenWeights: {
          precursor_a: 0,
          precursor_b: 0,
          drug: 1,
          failed_drug: 0,
        },
      },
    },
  ] satisfies PetriNetEdge[],
};
