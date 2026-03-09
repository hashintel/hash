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
        x: -180,
        y: 360,
      },
      {
        id: "place__1",
        name: "PlantBSupply",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: -180,
        y: 450,
      },
      {
        id: "place__2",
        name: "ManufacturingPlant",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 315,
        y: 405,
      },
      {
        id: "place__3",
        name: "QAQueue",
        colorId: "type__product",
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 795,
        y: 405,
      },
      {
        id: "place__4",
        name: "Disposal",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 1275,
        y: 525,
      },
      {
        id: "place__5",
        name: "Dispatch",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 1275,
        y: 300,
      },
      {
        id: "place__6",
        name: "Hospital",
        colorId: null,
        dynamicsEnabled: false,
        differentialEquationId: null,
        x: 1755,
        y: 300,
      },
    ],
    transitions: [
      {
        id: "transition__0",
        name: "Deliver to Plant",
        inputArcs: [
          { placeId: "place__0", weight: 1 },
          { placeId: "place__1", weight: 1 },
        ],
        outputArcs: [{ placeId: "place__2", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 1);",
        transitionKernelCode: "",
        x: 75,
        y: 405,
      },
      {
        id: "transition__1",
        name: "Manufacture",
        inputArcs: [{ placeId: "place__2", weight: 1 }],
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
        x: 555,
        y: 405,
      },
      {
        id: "transition__2",
        name: "Dispatch",
        inputArcs: [{ placeId: "place__3", weight: 1 }],
        outputArcs: [{ placeId: "place__5", weight: 1 }],
        lambdaType: "predicate",
        lambdaCode: `// Dispatch if product quality exceeds the defect threshold
export default Lambda((tokens, parameters) => {
  const { defect_rate } = parameters;
  return tokens.QAQueue[0].quality > defect_rate;
});`,
        transitionKernelCode: "",
        x: 1035,
        y: 300,
      },
      {
        id: "transition__3",
        name: "Dispose",
        inputArcs: [{ placeId: "place__3", weight: 1 }],
        outputArcs: [{ placeId: "place__4", weight: 1 }],
        lambdaType: "predicate",
        lambdaCode: `// Dispose if product quality is below the defect threshold
export default Lambda((tokens, parameters) => {
  const { defect_rate } = parameters;
  return tokens.QAQueue[0].quality <= defect_rate;
});`,
        transitionKernelCode: "",
        x: 1035,
        y: 525,
      },
      {
        id: "transition__4",
        name: "Ship",
        inputArcs: [{ placeId: "place__5", weight: 1 }],
        outputArcs: [{ placeId: "place__6", weight: 1 }],
        lambdaType: "stochastic",
        lambdaCode: "export default Lambda(() => 1 / 3);",
        transitionKernelCode: "",
        x: 1515,
        y: 300,
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
        id: "param__defect_rate",
        name: "Defect Rate",
        variableName: "defect_rate",
        type: "real",
        defaultValue: "0.2",
      },
    ],
  },
};
