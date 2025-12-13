import type {
  Color,
  DifferentialEquation,
  Parameter,
  Place,
  SDCPN,
  Transition,
} from "../../types/sdcpn";

type PartialColor = Omit<Partial<Color>, "elements"> & {
  elements?: Array<Partial<Color["elements"][number]>>;
};

/**
 * Helper to simplify writing of initial state for tests
 */
export function createSDCPN(options?: {
  types?: Array<PartialColor>;
  differentialEquations?: Array<Partial<DifferentialEquation>>;
  places?: Array<Partial<Place>>;
  transitions?: Array<Partial<Transition>>;
  parameters?: Array<Partial<Parameter>>;
}): SDCPN {
  const {
    types = [],
    differentialEquations = [],
    places = [],
    transitions = [],
    parameters = [],
  } = options ?? {};

  return {
    types: types.map((type, index) => ({
      id: type.id ?? `color_${index + 1}`,
      name: type.name ?? `Color${index + 1}`,
      iconSlug: type.iconSlug ?? "circle",
      displayColor: type.displayColor ?? "#FF0000",
      elements: (type.elements ?? []).map((el, elIndex) => ({
        elementId: el.elementId ?? `element_${elIndex + 1}`,
        name: el.name ?? `element${elIndex + 1}`,
        type: el.type ?? "real",
      })),
    })),
    differentialEquations: differentialEquations.map((de, index) => ({
      id: de.id ?? `de_${index + 1}`,
      colorId: de.colorId ?? "color_1",
      name: de.name ?? `DE${index + 1}`,
      code: de.code ?? "",
    })),
    places: places.map((place, index) => ({
      id: place.id ?? `place_${index + 1}`,
      name: place.name ?? `Place${index + 1}`,
      colorId: place.colorId ?? null,
      dynamicsEnabled: place.dynamicsEnabled ?? false,
      differentialEquationId: place.differentialEquationId ?? null,
      x: place.x ?? 0,
      y: place.y ?? 0,
    })),
    transitions: transitions.map((transition, index) => ({
      id: transition.id ?? `transition_${index + 1}`,
      name: transition.name ?? `Transition${index + 1}`,
      inputArcs: transition.inputArcs ?? [],
      outputArcs: transition.outputArcs ?? [],
      lambdaType: transition.lambdaType ?? "predicate",
      lambdaCode: transition.lambdaCode ?? "",
      transitionKernelCode: transition.transitionKernelCode ?? "",
      x: transition.x ?? 0,
      y: transition.y ?? 0,
    })),
    parameters: parameters.map((param, index) => ({
      id: param.id ?? `param_${index + 1}`,
      name: param.name ?? `Param${index + 1}`,
      variableName: param.variableName ?? `param${index + 1}`,
      type: param.type ?? "real",
      defaultValue: param.defaultValue ?? "0",
    })),
  };
}
