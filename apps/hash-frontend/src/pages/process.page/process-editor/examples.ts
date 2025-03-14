import type { Node } from "reactflow";

import type { PetriNetEdge } from "./edge-menu";
import type { TokenType } from "../token-editor";

export const exampleCPN = {
  tokenTypes: [
    { id: "precursor_a", name: "Precursor A", color: "#3498db" },
    { id: "precursor_b", name: "Precursor B", color: "#e74c3c" },
    { id: "drug", name: "Drug", color: "#2ecc71" },
    { id: "failed_drug", name: "Failed Drug", color: "#e74c3c" },
  ] satisfies TokenType[],
  nodes: [
    {
      id: "place_0",
      type: "place",
      position: { x: 20, y: 280 },
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
          { id: "precursor_b", name: "Precursor B", color: "#e74c3c" },
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
          { id: "precursor_b", name: "Precursor B", color: "#e74c3c" },
          { id: "drug", name: "Drug", color: "#2ecc71" },
          { id: "failed_drug", name: "Failed Drug", color: "#e74c3c" },
        ],
      },
    },
    {
      id: "place_2",
      type: "place",
      position: { x: 350, y: 450 },
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
          { id: "precursor_b", name: "Precursor B", color: "#e74c3c" },
          { id: "drug", name: "Drug", color: "#2ecc71" },
          { id: "failed_drug", name: "Failed Drug", color: "#e74c3c" },
        ],
      },
    },
    {
      id: "place_3",
      type: "place",
      position: { x: 700, y: 300 },
      data: {
        label: "QA Lab",
        tokenCounts: {
          precursor_a: 0,
          precursor_b: 0,
          drug: 0,
          failed_drug: 0,
        },
        tokenTypes: [
          { id: "precursor_a", name: "Precursor A", color: "#3498db" },
          { id: "precursor_b", name: "Precursor B", color: "#e74c3c" },
          { id: "drug", name: "Drug", color: "#2ecc71" },
          { id: "failed_drug", name: "Failed Drug", color: "#e74c3c" },
        ],
      },
    },
    {
      id: "place_4",
      type: "place",
      position: { x: 700, y: 600 },
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
          { id: "precursor_b", name: "Precursor B", color: "#e74c3c" },
          { id: "drug", name: "Drug", color: "#2ecc71" },
          { id: "failed_drug", name: "Failed Drug", color: "#e74c3c" },
        ],
      },
    },
    {
      id: "place_5",
      type: "place",
      position: { x: 1000, y: 300 },
      data: {
        label: "Central Warehouse",
        tokenCounts: {
          precursor_a: 0,
          precursor_b: 0,
          drug: 0,
          failed_drug: 0,
        },
        tokenTypes: [
          { id: "precursor_a", name: "Precursor A", color: "#3498db" },
          { id: "precursor_b", name: "Precursor B", color: "#e74c3c" },
          { id: "drug", name: "Drug", color: "#2ecc71" },
          { id: "failed_drug", name: "Failed Drug", color: "#e74c3c" },
        ],
      },
    },
    {
      id: "place_6",
      type: "place",
      position: { x: 1300, y: 200 },
      data: {
        label: "Hospital A",
        tokenCounts: {
          precursor_a: 0,
          precursor_b: 0,
          drug: 0,
          failed_drug: 0,
        },
        tokenTypes: [
          { id: "precursor_a", name: "Precursor A", color: "#3498db" },
          { id: "precursor_b", name: "Precursor B", color: "#e74c3c" },
          { id: "drug", name: "Drug", color: "#2ecc71" },
          { id: "failed_drug", name: "Failed Drug", color: "#e74c3c" },
        ],
      },
    },
    {
      id: "place_7",
      type: "place",
      position: { x: 1300, y: 400 },
      data: {
        label: "Hospital B",
        tokenCounts: {
          precursor_a: 0,
          precursor_b: 0,
          drug: 0,
          failed_drug: 0,
        },
        tokenTypes: [
          { id: "precursor_a", name: "Precursor A", color: "#3498db" },
          { id: "precursor_b", name: "Precursor B", color: "#e74c3c" },
          { id: "drug", name: "Drug", color: "#2ecc71" },
          { id: "failed_drug", name: "Failed Drug", color: "#e74c3c" },
        ],
      },
    },
    {
      id: "transition_0",
      type: "transition",
      position: { x: 140, y: 450 },
      data: {
        label: "Manufacture",
        description: "Combine precursors to create drug",
        processTimes: {
          precursor_a: 2, // 2 hours to process Precursor A
          precursor_b: 3, // 3 hours to process Precursor B
          drug: 0,
          failed_drug: 0,
        },
        priority: 1,
      },
    },
    {
      id: "transition_2",
      type: "transition",
      position: { x: 500, y: 600 },
      data: {
        label: "Dispose",
        description: "Dispose of failed drugs",
        processTimes: {
          precursor_a: 0,
          precursor_b: 0,
          drug: 0,
          failed_drug: 1, // 1 hour to dispose
        },
        priority: 1,
      },
    },
    {
      id: "transition_3",
      type: "transition",
      position: { x: 850, y: 300 },
      data: {
        label: "Store",
        description: "Move to warehouse storage",
        processTimes: {
          precursor_a: 0.5, // 30 minutes to store Precursor A
          precursor_b: 0.5, // 30 minutes to store Precursor B
          drug: 1, // 1 hour to store Drug (quality checks)
          failed_drug: 0,
        },
        priority: 1,
      },
    },
    {
      id: "transition_4",
      type: "transition",
      position: { x: 1150, y: 300 },
      data: {
        label: "Distribute",
        description: "Ship to hospitals",
        processTimes: {
          precursor_a: 0,
          precursor_b: 0,
          drug: 4, // 4 hours to distribute drugs to hospitals
          failed_drug: 0,
        },
        priority: 1,
      },
    },
    {
      id: "transition-3",
      type: "transition",
      position: { x: 500, y: 300 },
      data: {
        label: "Quality Check",
        processTimes: { drug: 0.5 },
        description: "Quality assurance with conditional outputs",
        hasConditions: true,
        conditions: [
          {
            id: "condition-pass",
            name: "Pass",
            probability: 90,
            outputEdgeIds: ["edge-3-4"],
          },
          {
            id: "condition-fail",
            name: "Fail",
            probability: 10,
            outputEdgeIds: ["edge-3-5"],
          },
        ],
        priority: 2, // Higher priority so it fires instead of transition_1
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
          precursor_a: 0,
          precursor_b: 0,
          drug: 1,
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
          precursor_a: 0,
          precursor_b: 0,
          drug: 1,
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
          drug: 0,
          failed_drug: 1,
        },
      },
    },
    {
      id: "transition_1-place_5",
      source: "transition_1",
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
      id: "place_3-transition_2",
      source: "place_3",
      target: "transition_2",
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
      id: "place_5-transition_4",
      source: "place_5",
      target: "transition_4",
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
      id: "transition_4-place_6",
      source: "transition_4",
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
    {
      id: "transition_4-place_7",
      source: "transition_4",
      target: "place_7",
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
      id: "edge-3-4",
      source: "transition-3",
      target: "place_5",
      type: "default",
      interactionWidth: 8,
      data: {
        tokenWeights: {
          drug: 1,
          failed_drug: 0,
        },
      },
    },
    {
      id: "edge-3-5",
      source: "transition-3",
      target: "place_3",
      type: "default",
      interactionWidth: 8,
      data: {
        tokenWeights: {
          drug: 0,
          failed_drug: 1,
        },
      },
    },
    {
      id: "place_2-transition-3",
      source: "place_2",
      target: "transition-3",
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
