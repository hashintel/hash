import type { MutatePetrinetOperation } from "@hashintel/brunch-agent-plugin-sdcpn";

const place = (index: number): MutatePetrinetOperation => ({
  operationId: `op-${index}`,
  basisId: "comparison-basis",
  type: "addPlace",
  input: {
    id: `place-${index}`,
    name: `Place${index}`,
    colorId: null,
    dynamicsEnabled: false,
    differentialEquationId: null,
    x: (index - 1) * 160,
    y: 0,
  },
});

const transition = (index: number): MutatePetrinetOperation => ({
  operationId: `op-${index + 10}`,
  basisId: "comparison-basis",
  type: "addTransition",
  input: {
    id: `transition-${index}`,
    name: `Transition ${index}`,
    inputArcs: [],
    outputArcs: [],
    lambdaType: "predicate",
    lambdaCode: "",
    transitionKernelCode: "",
    x: (index - 1) * 160 + 80,
    y: 160,
  },
});

const arc = (index: number): MutatePetrinetOperation => {
  const inputArc = index % 2 === 0;
  return {
    operationId: `op-${index + 18}`,
    basisId: "comparison-basis",
    type: "addArc",
    input: inputArc
      ? {
          transitionId: `transition-${(index % 7) + 1}`,
          arcDirection: "input",
          placeId: `place-${(index % 10) + 1}`,
          weight: 1,
          type: "standard",
        }
      : {
          transitionId: `transition-${(index % 7) + 1}`,
          arcDirection: "output",
          placeId: `place-${(index % 10) + 1}`,
          weight: 1,
        },
  };
};

/** The 25-operation empty-net target from the disposable carrier spike. */
export const comparisonOperations: readonly MutatePetrinetOperation[] = [
  ...Array.from({ length: 10 }, (_, index) => place(index + 1)),
  ...Array.from({ length: 7 }, (_, index) => transition(index + 1)),
  ...Array.from({ length: 8 }, (_, index) => arc(index)),
];
