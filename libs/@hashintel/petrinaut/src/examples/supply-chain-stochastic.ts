import { SNAP_GRID_SIZE } from "../constants/ui";
import type { SDCPN } from "../core/types/sdcpn";

export const supplyChainStochasticSDCPN: {
  title: string;
  petriNetDefinition: SDCPN;
} = {
  title: "Drug Production (Stochastic)",
  petriNetDefinition: {
    places: [
      {
        id: "place__0",
        name: "PlantASupply",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: -12 * SNAP_GRID_SIZE,
        y: 24 * SNAP_GRID_SIZE,
      },
      {
        id: "place__1",
        name: "PlantBSupply",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: -12 * SNAP_GRID_SIZE,
        y: 30 * SNAP_GRID_SIZE,
      },
      {
        id: "place__2",
        name: "ManufacturingPlant",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 21 * SNAP_GRID_SIZE,
        y: 27 * SNAP_GRID_SIZE,
      },
      {
        id: "place__3",
        name: "QAQueue",
        colorId: "type__product",
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 53 * SNAP_GRID_SIZE,
        y: 27 * SNAP_GRID_SIZE,
      },
      {
        id: "place__4",
        name: "Disposal",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 85 * SNAP_GRID_SIZE,
        y: 35 * SNAP_GRID_SIZE,
      },
      {
        id: "place__5",
        name: "Dispatch",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 85 * SNAP_GRID_SIZE,
        y: 20 * SNAP_GRID_SIZE,
      },
      {
        id: "place__6",
        name: "Hospital",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 117 * SNAP_GRID_SIZE,
        y: 20 * SNAP_GRID_SIZE,
      },
    ],
    transitions: [
      {
        id: "transition__0",
        name: "Deliver to Plant",
        inputArcs: [
          { placeId: "place__0", weight: 1, type: "standard" },
          { placeId: "place__1", weight: 1, type: "standard" },
        ],
        outputArcs: [{ placeId: "place__2", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 1);",
        transitionKernelCode: "",
        x: 5 * SNAP_GRID_SIZE,
        y: 27 * SNAP_GRID_SIZE,
      },
      {
        id: "transition__1",
        name: "Manufacture",
        inputArcs: [{ placeId: "place__2", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "place__3", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 1);",
        transitionKernelCode: `// Produce a product with random quality
export default TransitionKernel(() => {
  return {
    QAQueue: [
      { quality: Distribution.Uniform(0, 1) }
    ],
  };
});`,
        x: 37 * SNAP_GRID_SIZE,
        y: 27 * SNAP_GRID_SIZE,
      },
      {
        id: "transition__2",
        name: "Dispatch",
        inputArcs: [{ placeId: "place__3", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "place__5", weight: 1 }],
        lambdaType: "predicate",
        lambdaCode: `// Dispatch if product quality exceeds the quality threshold
export default Lambda((tokens, parameters) => {
  const { quality_threshold } = parameters;
  return tokens.QAQueue[0].quality >= quality_threshold;
});`,
        transitionKernelCode: "",
        x: 69 * SNAP_GRID_SIZE,
        y: 20 * SNAP_GRID_SIZE,
      },
      {
        id: "transition__3",
        name: "Dispose",
        inputArcs: [{ placeId: "place__3", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "place__4", weight: 1 }],
        lambdaType: "predicate",
        lambdaCode: `// Dispose if product quality is below the quality threshold
export default Lambda((tokens, parameters) => {
  const { quality_threshold } = parameters;
  return tokens.QAQueue[0].quality < quality_threshold;
});`,
        transitionKernelCode: "",
        x: 69 * SNAP_GRID_SIZE,
        y: 35 * SNAP_GRID_SIZE,
      },
      {
        id: "transition__4",
        name: "Ship",
        inputArcs: [{ placeId: "place__5", weight: 1, type: "standard" }],
        outputArcs: [{ placeId: "place__6", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 1 / 3);",
        transitionKernelCode: "",
        x: 101 * SNAP_GRID_SIZE,
        y: 20 * SNAP_GRID_SIZE,
      },
    ],
    types: [
      {
        id: "type__product",
        name: "Product",
        iconSlug: "product-icon",
        displayColor: "#4CAF50",
        elements: [
          {
            elementId: "element__quality",
            name: "quality",
            type: "real",
          },
        ],
      },
    ],
    differentialEquations: [],
    parameters: [
      {
        id: "param__quality_threshold",
        name: "Quality Threshold",
        variableName: "quality_threshold",
        type: "real",
        defaultValue: "0.2",
      },
    ],
  },
};
