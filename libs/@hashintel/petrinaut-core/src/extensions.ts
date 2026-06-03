import type { SDCPN } from "./types/sdcpn";

export const PETRINAUT_EXTENSION_NAMES = [
  "colors",
  "stochasticity",
  "dynamics",
  "parameters",
] as const;

export type PetrinautExtension = (typeof PETRINAUT_EXTENSION_NAMES)[number];

export type PetrinautExtensionSettings = Readonly<
  Record<PetrinautExtension, boolean>
>;

export type PetrinautHandleCapabilities = {
  /**
   * Whether the document handle should be treated as read-only by Petrinaut.
   * Host-level readonly config can still make a writable handle read-only.
   */
  readonly?: boolean;
  /**
   * Petri-net extensions unavailable for this handle. Omitted means all
   * extensions are enabled.
   */
  disabledExtensions?: readonly PetrinautExtension[];
};

export type ResolvedPetrinautHandleCapabilities = {
  readonly: boolean;
  disabledExtensions: readonly PetrinautExtension[];
  extensions: PetrinautExtensionSettings;
};

export const DEFAULT_PETRINAUT_EXTENSIONS: PetrinautExtensionSettings = {
  colors: true,
  stochasticity: true,
  dynamics: true,
  parameters: true,
};

export const resolvePetrinautHandleCapabilities = (
  capabilities?: PetrinautHandleCapabilities,
): ResolvedPetrinautHandleCapabilities => {
  const disabled = new Set<PetrinautExtension>(
    capabilities?.disabledExtensions ?? [],
  );

  if (disabled.has("colors")) {
    disabled.add("dynamics");
  }

  const disabledExtensions = PETRINAUT_EXTENSION_NAMES.filter((extension) =>
    disabled.has(extension),
  );

  return {
    readonly: capabilities?.readonly ?? false,
    disabledExtensions,
    extensions: {
      colors: !disabled.has("colors"),
      stochasticity: !disabled.has("stochasticity"),
      dynamics: !disabled.has("colors") && !disabled.has("dynamics"),
      parameters: !disabled.has("parameters"),
    },
  };
};

const canUseDynamics = (extensions: PetrinautExtensionSettings): boolean =>
  extensions.colors && extensions.dynamics;

export type TransitionLogicAvailability = {
  lambda: boolean;
  predicateLambda: boolean;
  stochasticLambda: boolean;
  transitionKernel: boolean;
};

export const hasTypedStandardInputPlace = (
  transition: SDCPN["transitions"][number],
  sdcpn: SDCPN,
): boolean =>
  transition.inputArcs.some((arc) => {
    if (arc.type === "inhibitor") {
      return false;
    }
    const place = sdcpn.places.find((item) => item.id === arc.placeId);
    return place?.colorId != null;
  });

const hasTypedOutputPlace = (
  transition: SDCPN["transitions"][number],
  sdcpn: SDCPN,
): boolean =>
  transition.outputArcs.some((arc) => {
    const place = sdcpn.places.find((item) => item.id === arc.placeId);
    return place?.colorId != null;
  });

export const isTransitionLambdaAvailable = (
  transition: SDCPN["transitions"][number],
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
): boolean =>
  extensions.stochasticity ||
  (extensions.colors && hasTypedStandardInputPlace(transition, sdcpn));

export const isTransitionKernelAvailable = (
  transition: SDCPN["transitions"][number],
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
): boolean => extensions.colors && hasTypedOutputPlace(transition, sdcpn);

export const getTransitionLogicAvailability = (
  transition: SDCPN["transitions"][number],
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
): TransitionLogicAvailability => {
  const predicateLambda =
    extensions.colors && hasTypedStandardInputPlace(transition, sdcpn);
  const stochasticLambda = extensions.stochasticity;

  return {
    lambda: predicateLambda || stochasticLambda,
    predicateLambda,
    stochasticLambda,
    transitionKernel: isTransitionKernelAvailable(
      transition,
      sdcpn,
      extensions,
    ),
  };
};

export const getEffectiveTransitionLambdaType = (
  transition: SDCPN["transitions"][number],
  availability: TransitionLogicAvailability,
): SDCPN["transitions"][number]["lambdaType"] => {
  if (transition.lambdaType === "stochastic" && availability.stochasticLambda) {
    return "stochastic";
  }
  if (transition.lambdaType === "predicate" && availability.predicateLambda) {
    return "predicate";
  }
  if (availability.stochasticLambda) {
    return "stochastic";
  }
  return "predicate";
};

export const isSelectionTypeAvailableForExtensions = (
  type: string,
  extensions: PetrinautExtensionSettings,
): boolean => {
  if (type === "type") {
    return extensions.colors;
  }
  if (type === "differentialEquation") {
    return canUseDynamics(extensions);
  }
  if (type === "parameter") {
    return extensions.parameters;
  }
  return true;
};

export const sanitizePlaceForExtensions = <
  Place extends SDCPN["places"][number],
>(
  place: Place,
  extensions: PetrinautExtensionSettings,
): Place => {
  if (extensions.colors && extensions.dynamics) {
    return place;
  }

  return {
    ...place,
    colorId: extensions.colors ? place.colorId : null,
    dynamicsEnabled: canUseDynamics(extensions) ? place.dynamicsEnabled : false,
    differentialEquationId: canUseDynamics(extensions)
      ? place.differentialEquationId
      : null,
    visualizerCode: extensions.colors ? place.visualizerCode : undefined,
  };
};

export const sanitizeTransitionForExtensions = <
  Transition extends SDCPN["transitions"][number],
>(
  transition: Transition,
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
): Transition => {
  const availability = getTransitionLogicAvailability(
    transition,
    sdcpn,
    extensions,
  );
  const lambdaType = getEffectiveTransitionLambdaType(transition, availability);

  if (
    availability.lambda &&
    transition.lambdaType === lambdaType &&
    availability.transitionKernel
  ) {
    return transition;
  }

  return {
    ...transition,
    lambdaType,
    lambdaCode:
      availability.lambda && transition.lambdaType === lambdaType
        ? transition.lambdaCode
        : "",
    transitionKernelCode: availability.transitionKernel
      ? transition.transitionKernelCode
      : "",
  };
};

export const stripDisabledExtensionData = (
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
): void => {
  if (!extensions.colors) {
    sdcpn.types.splice(0);
  }

  if (!canUseDynamics(extensions)) {
    sdcpn.differentialEquations.splice(0);
  }

  if (!extensions.parameters) {
    sdcpn.parameters.splice(0);
    for (const scenario of sdcpn.scenarios ?? []) {
      scenario.parameterOverrides = {};
    }
  }

  for (const place of sdcpn.places) {
    Object.assign(place, sanitizePlaceForExtensions(place, extensions));
    if (!extensions.colors) {
      delete place.visualizerCode;
    }
  }

  for (const transition of sdcpn.transitions) {
    Object.assign(
      transition,
      sanitizeTransitionForExtensions(transition, sdcpn, extensions),
    );
  }
};

export const sanitizeSDCPNForExtensions = (
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
): SDCPN => {
  const next: SDCPN = {
    places: sdcpn.places.map((place) => ({ ...place })),
    transitions: sdcpn.transitions.map((transition) => ({
      ...transition,
      inputArcs: transition.inputArcs.map((arc) => ({ ...arc })),
      outputArcs: transition.outputArcs.map((arc) => ({ ...arc })),
    })),
    types: sdcpn.types.map((type) => ({
      ...type,
      elements: type.elements.map((element) => ({ ...element })),
    })),
    differentialEquations: sdcpn.differentialEquations.map((equation) => ({
      ...equation,
    })),
    parameters: sdcpn.parameters.map((parameter) => ({ ...parameter })),
    scenarios: sdcpn.scenarios?.map((scenario) => ({
      ...scenario,
      scenarioParameters: scenario.scenarioParameters.map((parameter) => ({
        ...parameter,
      })),
      parameterOverrides: { ...scenario.parameterOverrides },
      initialState:
        scenario.initialState.type === "code"
          ? { ...scenario.initialState }
          : {
              type: "per_place",
              content: Object.fromEntries(
                Object.entries(scenario.initialState.content).map(
                  ([placeId, value]) => [
                    placeId,
                    Array.isArray(value) ? value.map((row) => [...row]) : value,
                  ],
                ),
              ),
            },
    })),
    metrics: sdcpn.metrics?.map((metric) => ({ ...metric })),
  };

  stripDisabledExtensionData(next, extensions);
  return next;
};
