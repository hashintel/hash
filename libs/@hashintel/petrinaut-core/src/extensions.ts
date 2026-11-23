import { getArcEndpoint } from "./arc-endpoints";
import { resolveComponent } from "./composition/interfaces";
import { cloneAdHocScenarioState } from "./simulation/authoring/scenario/ad-hoc/ad-hoc-actions";

import type { ResolvedLibraries } from "./composition/libraries";
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
  "components",
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
  components: true,
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
      components: !disabled.has("components"),
    },
  };
};

const canUseDynamics = (extensions: PetrinautExtensionSettings): boolean =>
  extensions.colors && extensions.dynamics;

const sanitizeScenarioInitialStateForExtensions = (
  initialState: NonNullable<SDCPN["scenarios"]>[number]["initialState"],
  extensions: PetrinautExtensionSettings,
): NonNullable<SDCPN["scenarios"]>[number]["initialState"] => {
  // Code-mode and ad-hoc initial states are returned as-is: like code, an
  // ad-hoc definition may reference coloured places, and stripping it here
  // would destroy the user's authored state.
  if (extensions.colors || initialState.type !== "per_place") {
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
  /** The libraries the document's imports resolved to: the ports of their components resolve too. */
  libraries?: ResolvedLibraries;
};

export const createArcPlaceResolver = (
  sdcpn: SDCPN,
  net: NetWithComponentInstances = sdcpn,
  { componentPortsEnabled = true, libraries }: ArcPlaceResolverOptions = {},
): ((arc: InputArc | OutputArc) => SDCPNPlace | undefined) => {
  const placeById = new Map(net.places.map((place) => [place.id, place]));
  const componentById = new Map(
    (sdcpn.components ?? []).map((component) => [component.id, component]),
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
    const component = instance
      ? resolveComponent(sdcpn, instance.component, libraries, componentById)
      : undefined;

    return component?.places.find(
      (place) => place.id === endpoint.portPlaceId && place.isPort,
    );
  };
};

const isComponentPortArc = (arc: InputArc | OutputArc): boolean =>
  getArcEndpoint(arc).kind === "componentPort";

/**
 * A test for an arc that reaches a port of a component of an import that is
 * not among `libraries`. What such a port carries cannot be told, so it
 * counts as typed: code written for it is kept until its library is read.
 */
const createUnreadPortTest = (
  net: NetWithComponentInstances,
  { componentPortsEnabled = true, libraries }: ArcPlaceResolverOptions = {},
): ((arc: InputArc | OutputArc) => boolean) => {
  const unreadInstanceIds = new Set(
    (net.componentInstances ?? [])
      .filter(
        ({ component }) =>
          component.from !== undefined &&
          libraries?.has(component.from) !== true,
      )
      .map(({ id }) => id),
  );
  return (arc) => {
    const endpoint = getArcEndpoint(arc);
    return (
      componentPortsEnabled &&
      endpoint.kind === "componentPort" &&
      unreadInstanceIds.has(endpoint.componentInstanceId)
    );
  };
};

type ArcTest = (arc: InputArc | OutputArc) => boolean;

/**
 * A test for an arc whose place carries typed tokens: a coloured place of
 * `net`, a coloured port of a component, or a port that cannot be read yet.
 *
 * It indexes the places of `net` when it is made, so a test shared by a pass
 * over the transitions of a net reads the places once. Make a new one after a
 * place joins or leaves the net.
 */
const createTypedArcTest = (
  sdcpn: SDCPN,
  net: NetWithComponentInstances,
  options: ArcPlaceResolverOptions,
): ArcTest => {
  const resolveArcPlace = createArcPlaceResolver(sdcpn, net, options);
  const isUnreadPort = createUnreadPortTest(net, options);
  return (arc) => resolveArcPlace(arc)?.colorId != null || isUnreadPort(arc);
};

const hasTypedNonInhibitorInput = (
  transition: SDCPN["transitions"][number],
  isTypedArc: ArcTest,
): boolean =>
  transition.inputArcs.some(
    (arc) => arc.type !== "inhibitor" && isTypedArc(arc),
  );

/** Which code `transition` can have, given the test for a typed arc of its net. */
const availabilityOf = (
  transition: SDCPN["transitions"][number],
  extensions: PetrinautExtensionSettings,
  isTypedArc: ArcTest,
): TransitionLogicAvailability => {
  const predicateLambda =
    extensions.stochasticity ||
    (extensions.colors && hasTypedNonInhibitorInput(transition, isTypedArc));
  const stochasticLambda = extensions.stochasticity;

  return {
    lambda: predicateLambda || stochasticLambda,
    predicateLambda,
    stochasticLambda,
    transitionKernel:
      extensions.colors && transition.outputArcs.some(isTypedArc),
  };
};

export const hasTypedNonInhibitorInputPlace = (
  transition: SDCPN["transitions"][number],
  sdcpn: SDCPN,
  net: NetWithComponentInstances = sdcpn,
  options: ArcPlaceResolverOptions = {},
): boolean =>
  hasTypedNonInhibitorInput(
    transition,
    createTypedArcTest(sdcpn, net, options),
  );

export const isTransitionLambdaAvailable = (
  transition: SDCPN["transitions"][number],
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
  net: NetWithComponentInstances = sdcpn,
  libraries?: ResolvedLibraries,
): boolean =>
  extensions.stochasticity ||
  (extensions.colors &&
    hasTypedNonInhibitorInputPlace(transition, sdcpn, net, {
      componentPortsEnabled: extensions.components,
      libraries,
    }));

export type TransitionLogicAvailabilityReader = (
  transition: SDCPN["transitions"][number],
) => TransitionLogicAvailability;

/**
 * {@link getTransitionLogicAvailability} for every transition of one net: a
 * pass over them asks through one reader, so the places of the net are
 * indexed once for the pass, where a call per transition indexes them for
 * each transition.
 *
 * The index holds the places as they were when the reader was made, and
 * none is made while colours are disabled. Make the reader once the places
 * of the net are settled, and a new one after a place joins or leaves the
 * net.
 */
export const createTransitionLogicAvailabilityReader = (
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
  net: NetWithComponentInstances = sdcpn,
  libraries?: ResolvedLibraries,
): TransitionLogicAvailabilityReader => {
  // An answer asks about arcs only while colours are enabled.
  const isTypedArc = extensions.colors
    ? createTypedArcTest(sdcpn, net, {
        componentPortsEnabled: extensions.components,
        libraries,
      })
    : () => false;

  return (transition) => availabilityOf(transition, extensions, isTypedArc);
};

/**
 * Which of a transition's code a user can write. `libraries` are the ones
 * the document's imports resolved to: without them, a port of a component of
 * an import counts as no place.
 *
 * A call with colours enabled indexes every place of `net`. Inside this
 * package, a pass over the transitions of a net asks through one
 * `createTransitionLogicAvailabilityReader`.
 */
export const getTransitionLogicAvailability = (
  transition: SDCPN["transitions"][number],
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
  net: NetWithComponentInstances = sdcpn,
  libraries?: ResolvedLibraries,
): TransitionLogicAvailability =>
  createTransitionLogicAvailabilityReader(
    sdcpn,
    extensions,
    net,
    libraries,
  )(transition);

export const isTransitionKernelAvailable = (
  transition: SDCPN["transitions"][number],
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
  net: NetWithComponentInstances = sdcpn,
  libraries?: ResolvedLibraries,
): boolean =>
  getTransitionLogicAvailability(transition, sdcpn, extensions, net, libraries)
    .transitionKernel;

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
  if (type === "componentInstance" || type === "fusion") {
    return extensions.components;
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

  const sanitized: Place = {
    ...place,
    colorId: extensions.colors ? place.colorId : null,
    dynamicsEnabled: canUseDynamics(extensions) ? place.dynamicsEnabled : false,
    visualizerCode: extensions.colors ? place.visualizerCode : undefined,
  };
  if (!canUseDynamics(extensions)) {
    delete sanitized.dynamics;
  }
  return sanitized;
};

/**
 * `transition` without the code `availability` rules out, and with the kind
 * of lambda it leaves: `transition` itself when it has nothing to lose.
 */
export const sanitizeTransitionForAvailability = <
  Transition extends SDCPN["transitions"][number],
>(
  transition: Transition,
  availability: TransitionLogicAvailability,
): Transition => {
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
  fusions?: SDCPN["fusions"];
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

  // With colours and dynamics on, a place has nothing to lose.
  if (!extensions.colors || !extensions.dynamics) {
    for (const place of net.places) {
      Object.assign(place, sanitizePlaceForExtensions(place, extensions));
      if (!extensions.colors) {
        delete place.visualizerCode;
      }
      if (!canUseDynamics(extensions)) {
        delete place.dynamics;
      }
    }
  }

  if (!extensions.components && net.fusions !== undefined) {
    const targetNet = net;
    delete targetNet.fusions;
  }

  // One reader for the whole pass: the places of the net are settled above,
  // and a reader per transition would read all of them for each transition.
  const readAvailability = createTransitionLogicAvailabilityReader(
    sdcpn,
    extensions,
    net,
  );

  for (const transition of net.transitions) {
    if (!extensions.components) {
      transition.inputArcs = transition.inputArcs.filter(
        (arc) => !isComponentPortArc(arc),
      );
      transition.outputArcs = transition.outputArcs.filter(
        (arc) => !isComponentPortArc(arc),
      );
    }

    const sanitized = sanitizeTransitionForAvailability(
      transition,
      readAvailability(transition),
    );
    if (sanitized !== transition) {
      Object.assign(transition, sanitized);
    }
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

  for (const component of sdcpn.components ?? []) {
    stripDisabledExtensionDataFromNet(sdcpn, component, extensions);
  }
};

const cloneComponentInstances = (
  componentInstances: SDCPN["componentInstances"],
): SDCPN["componentInstances"] =>
  componentInstances?.map((instance) => ({
    ...instance,
    component: { ...instance.component },
    parameterValues: { ...instance.parameterValues },
    ...(instance.implementation === undefined
      ? {}
      : { implementation: { ...instance.implementation } }),
  }));

/** A copy that shares nothing with `place`; `dynamics` stays absent when absent. */
const clonePlace = (place: SDCPNPlace): SDCPNPlace => ({
  ...place,
  ...(place.dynamics === undefined
    ? {}
    : { dynamics: place.dynamics.map((term) => ({ ...term })) }),
});

const cloneFusions = (
  fusions: NonNullable<SDCPN["fusions"]>,
): NonNullable<SDCPN["fusions"]> =>
  fusions.map((fusion) => ({
    ...fusion,
    members: fusion.members.map((member) => ({ ...member })),
  }));

const cloneComponent = (
  component: NonNullable<SDCPN["components"]>[number],
): NonNullable<SDCPN["components"]>[number] => {
  const next: NonNullable<SDCPN["components"]>[number] = {
    id: component.id,
    name: component.name,
    places: component.places.map(clonePlace),
    transitions: component.transitions.map((transition) => ({
      ...transition,
      inputArcs: transition.inputArcs.map((arc) => ({ ...arc })),
      outputArcs: transition.outputArcs.map((arc) => ({ ...arc })),
    })),
    types: component.types.map((type) => ({
      ...type,
      elements: type.elements.map((element) => ({ ...element })),
    })),
    differentialEquations: component.differentialEquations.map((equation) => ({
      ...equation,
    })),
    parameters: component.parameters.map((parameter) => ({ ...parameter })),
  };

  // Only set optional keys that are present on the source — see
  // `sanitizeSDCPNForExtensions` below for why absent must stay absent.
  if (component.description !== undefined) {
    next.description = component.description;
  }

  if (component.metadata !== undefined) {
    next.metadata = { ...component.metadata };
  }

  if (component.interface) {
    next.interface = true;
  }

  if (component.implements) {
    next.implements = [...component.implements];
  }

  if (component.iconSvg !== undefined) {
    next.iconSvg = component.iconSvg;
  }

  if (component.displayColor !== undefined) {
    next.displayColor = component.displayColor;
  }

  if (component.componentInstances) {
    next.componentInstances = cloneComponentInstances(
      component.componentInstances,
    );
  }

  if (component.fusions) {
    next.fusions = cloneFusions(component.fusions);
  }

  return next;
};

/**
 * Produce a sanitized deep copy of an SDCPN with data for disabled extensions
 * stripped out.
 *
 * The optional keys are only set when they are present on the source. Writing
 * them unconditionally would leave them present with a value of `undefined`,
 * which is not the same shape as a definition loaded back from JSON — where
 * absent keys stay absent — and would make `isSDCPNEqual` report an untouched
 * net as changed.
 */
export const sanitizeSDCPNForExtensions = (
  sdcpn: SDCPN,
  extensions: PetrinautExtensionSettings,
): SDCPN => {
  const next: SDCPN = {
    places: sdcpn.places.map(clonePlace),
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
  };

  if (sdcpn.description !== undefined) {
    next.description = sdcpn.description;
  }

  if (sdcpn.metadata !== undefined) {
    next.metadata = { ...sdcpn.metadata };
  }

  if (sdcpn.scenarios) {
    next.scenarios = sdcpn.scenarios.map((scenario) => ({
      ...scenario,
      scenarioParameters: scenario.scenarioParameters.map((parameter) => ({
        ...parameter,
      })),
      parameterOverrides: { ...scenario.parameterOverrides },
      initialState:
        scenario.initialState.type === "per_place"
          ? {
              type: "per_place",
              content: Object.fromEntries(
                Object.entries(scenario.initialState.content).map(
                  ([placeId, value]) => [
                    placeId,
                    Array.isArray(value) ? value.map((row) => [...row]) : value,
                  ],
                ),
              ),
            }
          : scenario.initialState.type === "adhoc"
            ? {
                type: "adhoc",
                content: cloneAdHocScenarioState(scenario.initialState.content),
              }
            : { ...scenario.initialState },
    }));
  }

  if (sdcpn.metrics) {
    next.metrics = sdcpn.metrics.map((metric) => ({ ...metric }));
  }

  if (sdcpn.imports) {
    next.imports = sdcpn.imports.map((entry) => ({ ...entry }));
  }

  if (sdcpn.components) {
    next.components = sdcpn.components.map(cloneComponent);
  }

  if (sdcpn.componentInstances) {
    next.componentInstances = cloneComponentInstances(sdcpn.componentInstances);
  }

  if (sdcpn.fusions) {
    next.fusions = cloneFusions(sdcpn.fusions);
  }

  if (sdcpn.implementations) {
    next.implementations = sdcpn.implementations.map((entry) => ({
      interface: { ...entry.interface },
      component: { ...entry.component },
    }));
  }

  stripDisabledExtensionData(next, extensions);

  if (!extensions.components) {
    delete next.imports;
    delete next.components;
    delete next.componentInstances;
    delete next.implementations;
  }

  return next;
};
