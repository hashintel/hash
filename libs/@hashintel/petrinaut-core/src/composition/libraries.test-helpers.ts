import type { Library, LibraryParameter, LibraryTokenType } from "./libraries";

const rate: LibraryParameter = {
  id: "rate",
  name: "Rate",
  variableName: "rate",
  type: "real",
  defaultValue: "1",
};

/**
 * A library with an interface, `scale`, and a component that runs and has its
 * ports and its parameter, `belt`. Its ids are plain words, as a host may
 * write them.
 */
export const logistics: Library = {
  id: "@hashintel/logistics",
  name: "Logistics",
  components: [
    {
      id: "scale",
      name: "Scale",
      description: "Weighs what passes",
      ports: [
        { id: "in", name: "In", direction: "in" },
        { id: "out", name: "Out", direction: "out" },
      ],
      parameters: [rate],
    },
    {
      id: "belt",
      name: "Belt",
      ports: [
        { id: "in", name: "In" },
        { id: "out", name: "Out" },
      ],
      parameters: [rate],
      body: {
        places: [
          {
            id: "in",
            name: "In",
            colorId: null,
            dynamicsEnabled: false,
            x: 0,
            y: 0,
          },
          {
            id: "out",
            name: "Out",
            colorId: null,
            dynamicsEnabled: false,
            x: 200,
            y: 0,
          },
        ],
        transitions: [
          {
            id: "move",
            name: "Move",
            inputArcs: [{ placeId: "in", weight: 1, type: "standard" }],
            outputArcs: [{ placeId: "out", weight: 1 }],
            lambdaType: "predicate",
            lambdaCode: "",
            transitionKernelCode: "",
            x: 100,
            y: 0,
          },
        ],
      },
    },
  ],
};

/**
 * A library with one interface, `gate`, whose port `in` carries tokens of one
 * element. Two of them differ in the library's id and in that element alone.
 */
export const gateLibrary = (
  id: string,
  element: LibraryTokenType["elements"][number],
): Library => ({
  id,
  name: id,
  components: [
    {
      id: "gate",
      name: "Gate",
      ports: [
        {
          id: "in",
          name: "In",
          tokenType: {
            name: "Parcel",
            displayColor: "#1E90FF",
            elements: [element],
          },
        },
      ],
    },
  ],
});

/**
 * A library with one component that runs, `tank`. Its body writes plain
 * words for ids: a type `fluid`, an equation `drain`, a transition `fill`,
 * and beside its port `in` a place that is no port, `store`. Two of them
 * differ in the library's id and in the element of `fluid` alone.
 */
export const tankLibrary = (
  id: string,
  element: LibraryTokenType["elements"][number],
): Library => ({
  id,
  name: id,
  components: [
    {
      id: "tank",
      name: "Tank",
      ports: [
        {
          id: "in",
          name: "In",
          tokenType: {
            name: "Fluid",
            displayColor: "#1E90FF",
            elements: [element],
          },
        },
      ],
      body: {
        types: [
          {
            id: "fluid",
            name: "Fluid",
            iconSlug: "circle",
            displayColor: "#1E90FF",
            elements: [{ elementId: "amount", ...element }],
          },
        ],
        differentialEquations: [
          {
            id: "drain",
            name: "Drain",
            colorId: "fluid",
            code: "return {};",
            arity: 1,
          },
        ],
        places: [
          {
            id: "in",
            name: "In",
            colorId: "fluid",
            dynamicsEnabled: true,
            dynamics: [{ differentialEquationId: "drain" }],
            x: 0,
            y: 0,
          },
          {
            id: "store",
            name: "Store",
            colorId: "fluid",
            dynamicsEnabled: false,
            x: 200,
            y: 0,
          },
        ],
        transitions: [
          {
            id: "fill",
            name: "Fill",
            inputArcs: [{ placeId: "in", weight: 1, type: "standard" }],
            outputArcs: [
              { endpoint: { kind: "place", placeId: "store" }, weight: 1 },
            ],
            lambdaType: "predicate",
            lambdaCode: "",
            transitionKernelCode: "",
            x: 100,
            y: 0,
          },
        ],
      },
    },
  ],
});
