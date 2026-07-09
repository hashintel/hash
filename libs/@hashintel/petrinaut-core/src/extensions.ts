import { getArcEndpoint } from "./arc-endpoints";

import type {
  ComponentInstance,
  InputArc,
  OutputArc,
  Place as SDCPNPlace,
  SDCPN,
} from "./types/sdcpn";

export const PETRINAUT_EXTENSION_NAMES = [
  "colors",
  "stochasticity",
  "dynamics",
  "parameters",
  "subnets",
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
  subnets: true,
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
      subnets: !disabled.has("subnets"),
    },
  };
};

const canUseDynamics = (extensions: PetrinautExtensionSettings): boolean =>
  extensions.colors && extensions.dynamics;

const sanitizeScenarioInitialStateForExtensions = (
  initialState: NonNullable<SDCPN["scenarios"]>[number]["initialState"],
  extensions: PetrinautExtensionSettings,
): NonNullable<SDCPN["scenarios"]>[number]["initialState"] => {
  if (extensions.colors || initialState.type === "code") {
    return initialState;
  }

  return {
    type: "per_place",
    content: Object.fromEntries(
      Object.entries(initialState.content).map(([placeId, value]) => [
        placeId,
        Array.isArray(value) ? String(value.length) : value,
      ]),
    ),
  };
};

export type TransitionLogicAvailability = {
  lambda: boolean;
  predicateLambda: boolean;
  stochasticLambda: boolean;
  transitionKernel: boolean;
};

type NetWithComponentInstances = {
  places: SDCPNPlace[];
  componentInstances?: ComponentInstance[];
};

type ArcPlaceResolverOptions = {
  componentPortsEnabled?: boolean;
};

export const createArcPlaceResolver = (
  sdcpn: SDCPN,
  net: NetWithComponentInstances = sdcpn,
  { componentPortsEnabled = true }: ArcPlaceResolverOptions = {},
): ((arc: InputArc | OutputArc) => SDCPNPlace | undefined) => {
  const placeById = new Map(net.places.map((place) => [place.id, place]));
  const subnetById = new Map(
    (sdcpn.subnets ?? []).map((subnet) => [subnet.id, subnet]),
  );
  const instanceById = new Map(
    (net.componentInstances ?? []).map((instance) => [instance.id, instance]),
  );

  return (arc) => {
    const endpoint = getArcEndpoint(arc);

    if (endpoint.kind === "place") {
      return placeById.get(endpoint.placeId);
    }
    if (!componentPortsEnabled) {
      return undefined;
    }

    const instance = instanceById.get(endpoint.componentInstanceId);
    const subnet = instance ? subnetById.get(instance.subnetId) : undefined;

    return subnet?.places.find(
      (place) => place.id === endpoint.portPlaceId && place.isPort,
    );
  };
};

const isComponentPortArc = (arc: InputArc | OutputArc): boolean =>
  getArcEndpoint(arc).kind === "componentPort";

export const hasTypedNonInhibitorInputPlace = (
  transition: SDCPN["transitions"][number],
  sdcpn: SDCPN,
  net: NetWithComponentInstances = sdcpn,
  options?: ArcPlaceResolverOptions,
): boolean => {
  const resolveArcPlace = createArcPlaceResolver(sdcpn, net, options);

  return transition.inputArcs.some((arc) => {
    if (arc.type === "inhibitor") {
      return false;
    }

    return resolveArcPlace(arc)?.colorId != null;
  });
};

const hasTypedOutputPlace = (
  transition: SDCPN["transitions"][number],
  sdcpn: SDCPN,
  net: NetWithComponentInstances = sdcpn,
  options?: ArcPlaceResolverOptions,
): boolean => {
  const resolveArcPlace = createArcPlaceResolver(sdcpn, net, options);

  return transition.outputArcs.some(
    (arc) => resolveArcPlace(arc)?.colorId != null,
  );
};

export const isTransitionLambdaAvailable = (
  transition: SDCPN["transitions"][number],
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
  net: NetWithComponentInstances = sdcpn,
): boolean =>
  extensions.stochasticity ||
  (extensions.colors &&
    hasTypedNonInhibitorInputPlace(transition, sdcpn, net, {
      componentPortsEnabled: extensions.subnets,
    }));

export const isTransitionKernelAvailable = (
  transition: SDCPN["transitions"][number],
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
  net: NetWithComponentInstances = sdcpn,
): boolean =>
  extensions.colors &&
  hasTypedOutputPlace(transition, sdcpn, net, {
    componentPortsEnabled: extensions.subnets,
  });

export const getTransitionLogicAvailability = (
  transition: SDCPN["transitions"][number],
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
  net: NetWithComponentInstances = sdcpn,
): TransitionLogicAvailability => {
  const predicateLambda =
    extensions.stochasticity ||
    (extensions.colors &&
      hasTypedNonInhibitorInputPlace(transition, sdcpn, net, {
        componentPortsEnabled: extensions.subnets,
      }));
  const stochasticLambda = extensions.stochasticity;

  return {
    lambda: predicateLambda || stochasticLambda,
    predicateLambda,
    stochasticLambda,
    transitionKernel: isTransitionKernelAvailable(
      transition,
      sdcpn,
      extensions,
      net,
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
  if (type === "componentInstance") {
    return extensions.subnets;
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
  net: NetWithComponentInstances = sdcpn,
): Transition => {
  const availability = getTransitionLogicAvailability(
    transition,
    sdcpn,
    extensions,
    net,
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

type SanitizableNet = Pick<
  SDCPN,
  "places" | "transitions" | "types" | "differentialEquations" | "parameters"
> & {
  componentInstances?: SDCPN["componentInstances"];
};

const stripDisabledExtensionDataFromNet = (
  sdcpn: SDCPN,
  net: SanitizableNet,
  extensions: PetrinautExtensionSettings,
): void => {
  if (!extensions.colors) {
    net.types.splice(0);
  }

  if (!canUseDynamics(extensions)) {
    net.differentialEquations.splice(0);
  }

  if (!extensions.parameters) {
    net.parameters.splice(0);
  }

  for (const place of net.places) {
    Object.assign(place, sanitizePlaceForExtensions(place, extensions));
    if (!extensions.colors) {
      delete place.visualizerCode;
    }
  }

  for (const transition of net.transitions) {
    if (!extensions.subnets) {
      transition.inputArcs = transition.inputArcs.filter(
        (arc) => !isComponentPortArc(arc),
      );
      transition.outputArcs = transition.outputArcs.filter(
        (arc) => !isComponentPortArc(arc),
      );
    }

    Object.assign(
      transition,
      sanitizeTransitionForExtensions(transition, sdcpn, extensions, net),
    );
  }
};

export const stripDisabledExtensionData = (
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
): void => {
  stripDisabledExtensionDataFromNet(sdcpn, sdcpn, extensions);

  if (!extensions.parameters) {
    for (const scenario of sdcpn.scenarios ?? []) {
      scenario.parameterOverrides = {};
    }
  }

  if (!extensions.colors) {
    for (const scenario of sdcpn.scenarios ?? []) {
      scenario.initialState = sanitizeScenarioInitialStateForExtensions(
        scenario.initialState,
        extensions,
      );
    }
  }

  for (const subnet of sdcpn.subnets ?? []) {
    stripDisabledExtensionDataFromNet(sdcpn, subnet, extensions);
  }
};

const cloneComponentInstances = (
  componentInstances: SDCPN["componentInstances"],
): SDCPN["componentInstances"] =>
  componentInstances?.map((instance) => ({
    ...instance,
    parameterValues: { ...instance.parameterValues },
  }));

const cloneSubnet = (
  subnet: NonNullable<SDCPN["subnets"]>[number],
): NonNullable<SDCPN["subnets"]>[number] => ({
  id: subnet.id,
  name: subnet.name,
  places: subnet.places.map((place) => ({ ...place })),
  transitions: subnet.transitions.map((transition) => ({
    ...transition,
    inputArcs: transition.inputArcs.map((arc) => ({ ...arc })),
    outputArcs: transition.outputArcs.map((arc) => ({ ...arc })),
  })),
  types: subnet.types.map((type) => ({
    ...type,
    elements: type.elements.map((element) => ({ ...element })),
  })),
  differentialEquations: subnet.differentialEquations.map((equation) => ({
    ...equation,
  })),
  parameters: subnet.parameters.map((parameter) => ({ ...parameter })),
  componentInstances: cloneComponentInstances(subnet.componentInstances),
});

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
    subnets: sdcpn.subnets?.map(cloneSubnet),
    componentInstances: cloneComponentInstances(sdcpn.componentInstances),
  };

  stripDisabledExtensionData(next, extensions);

  if (!extensions.subnets) {
    next.subnets = undefined;
    next.componentInstances = undefined;
  }

  return next;
};
