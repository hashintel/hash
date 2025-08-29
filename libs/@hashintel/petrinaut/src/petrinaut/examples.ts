import { nodeDimensions } from "./styling";
import type { ArcType, NodeType, TokenType } from "./types";

export const exampleCPN = {
  title: "Drug Production",
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
      ...nodeDimensions.place,
      data: {
        type: "place",
        label: "Plant A Supply",
        initialTokenCounts: {
          precursor_a: 10,
          precursor_b: 0,
          drug: 0,
          failed_drug: 0,
        },
      },
    },
    {
      id: "place_1",
      type: "place",
      position: { x: 20, y: 600 },
      ...nodeDimensions.place,
      data: {
        type: "place",
        label: "Plant B Supply",
        initialTokenCounts: {
          precursor_a: 0,
          precursor_b: 10,
          drug: 0,
          failed_drug: 0,
        },
      },
    },
    {
      id: "place_2",
      type: "place",
      position: { x: 300, y: 300 },
      ...nodeDimensions.place,
      data: {
        type: "place",
        label: "Manufacturing Plant",
        initialTokenCounts: {
          precursor_a: 0,
          precursor_b: 0,
          drug: 0,
          failed_drug: 0,
        },
      },
    },
    {
      id: "place_3",
      type: "place",
      position: { x: 700, y: 350 },
      ...nodeDimensions.place,
      data: {
        type: "place",
        label: "QA Queue",
        initialTokenCounts: {
          precursor_a: 0,
          precursor_b: 0,
          drug: 0,
          failed_drug: 0,
        },
      },
    },
    {
      id: "place_4",
      type: "place",
      position: { x: 1100, y: 600 },
      ...nodeDimensions.place,
      data: {
        type: "place",
        label: "Disposal",
        initialTokenCounts: {
          precursor_a: 0,
          precursor_b: 0,
          drug: 0,
          failed_drug: 0,
        },
      },
    },
    {
      id: "place_5",
      type: "place",
      position: { x: 1000, y: 200 },
      ...nodeDimensions.place,
      data: {
        type: "place",
        label: "Dispatch",
        initialTokenCounts: {
          precursor_a: 0,
          precursor_b: 0,
          drug: 0,
          failed_drug: 0,
        },
      },
    },
    {
      id: "place_6",
      type: "place",
      position: { x: 1300, y: 380 },
      ...nodeDimensions.place,
      data: {
        type: "place",
        label: "Hospital",
        initialTokenCounts: {
          precursor_a: 0,
          precursor_b: 0,
          drug: 0,
          failed_drug: 0,
        },
      },
    },
    {
      id: "transition_0",
      type: "transition",
      position: { x: 100, y: 400 },
      ...nodeDimensions.transition,
      data: {
        type: "transition",
        label: "Deliver to Plant",
        description: "Transport precursors to manufacturing plant",
        delay: 2,
      },
    },
    {
      id: "transition_1",
      type: "transition",
      position: { x: 490, y: 350 },
      ...nodeDimensions.transition,
      data: {
        type: "transition",
        label: "Manufacture",
        description: "Combine precursors to create drug",
        delay: 3,
      },
    },
    {
      id: "transition_2",
      type: "transition",
      position: { x: 870, y: 400 },
      ...nodeDimensions.transition,
      data: {
        type: "transition",
        label: "Quality Check",
        delay: 2,
        description: "Quality assurance with conditional outputs",
        conditions: [
          {
            id: "condition-pass",
            name: "Pass",
            probability: 80,
            outputEdgeId: "transition_2-place_5",
          },
          {
            id: "condition-fail",
            name: "Fail",
            probability: 20,
            outputEdgeId: "transition_2-place_4",
          },
        ],
      },
    },
    {
      id: "transition_3",
      type: "transition",
      position: { x: 1150, y: 280 },
      ...nodeDimensions.transition,
      data: {
        type: "transition",
        label: "Ship",
        description: "Ship drugs to hospital",
        delay: 3,
      },
    },
  ] satisfies NodeType[],
  arcs: [
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
  ] satisfies ArcType[],
};
