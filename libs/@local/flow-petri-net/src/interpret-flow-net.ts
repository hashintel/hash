import { getArcEndpoint, toPetrinautId } from "@hashintel/petrinaut-core";
import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";

import {
  generateAccumulatorPlaceKey,
  generateIteratorPlaceKey,
  generatePendingPlaceKey,
} from "./flow-net-keys.js";

import type {
  FlowNetMetadata,
  InstanceMetadata,
  TransitionMetadata,
  TransitionRole,
} from "./flow-net-metadata.js";
import type {
  ArcEndpoint,
  ComponentInstance,
  InputArc,
  JsonValue,
  SDCPN,
  Subnet,
  Transition,
} from "@hashintel/petrinaut-core";
import type {
  ActionDefinition,
  FlowActionDefinitionId,
} from "@local/hash-isomorphic-utils/flows/types";

/*
 * Runs a compiled flow net by its transitions' roles (see `TransitionRole`), working out the tokens itself: the
 * net's kernels are placeholders and it has no guards. Every transition fires as soon as it's enabled, except
 * those that need to know something from outside the net: an action attempt's outcome, how many items a
 * `forEach` step's array has, and, when the run is told when steps start, an action step starting. The executor
 * runs a flow by calling actions and applying their outcomes; a run's view replays the outcomes its events record.
 */

/** A run of a step: its id in the definition and, inside `forEach` steps, its item's index in each, outermost first. */
export type FlowNetStepRun = { stepId: string; itemPath: number[] };

/**
 * Where a place or transition is, as ids from the root net down, with the root implied: `[placeId]` in the root net,
 * `[componentInstanceId, placeId]` inside a step's instance. Not to be confused with a token's `itemPath`.
 */
export type FlowNetPath = readonly [string, ...string[]];

/** A key for a path in maps and sets. Petrinaut ids are lowercase UUIDs, so `/` can't appear in one. */
export const flowNetPathKey = (path: FlowNetPath) => path.join("/");

export const isSameFlowNetPath = (path: FlowNetPath, otherPath: FlowNetPath) =>
  path.length === otherPath.length &&
  path.every((id, index) => otherPath[index] === id);

/** For messages only. */
export const formatFlowNetPath = (path: FlowNetPath) => path.join(".");

/** Where the value a token refers to comes from. Tokens carry references to values, never the values themselves. */
export type FlowNetValueRef =
  | { kind: "flowInput"; inputName: string }
  | {
      kind: "stepOutput";
      stepId: string;
      outputName: string;
      itemPath: number[];
    }
  /** A constant the step's instance records in its `metadata.constants`. */
  | { kind: "constant"; stepId: string; inputName: string }
  /** The default of an input nothing is connected to. */
  | { kind: "default"; stepId: string; inputName: string }
  /** One item of a `forEach` step's array: the last index of `itemPath` is the item's. */
  | { kind: "item"; forEachStepId: string; itemPath: number[] }
  /** A `forEach` step's collected output, from each of its items in order. */
  | { kind: "collected"; forEachStepId: string; itemPath: number[] };

export type FlowNetToken = {
  /** The item the token is for: empty outside any `forEach`, its index in each enclosing one inside. */
  itemPath: number[];
} & (
  | { kind: "pending" }
  | { kind: "value"; present: true; ref: FlowNetValueRef }
  /** A value that's missing, such as an optional input nothing is connected to. */
  | { kind: "value"; present: false }
  /** Starts an action with no inputs, or records that an action with no outputs succeeded. */
  | { kind: "signal" }
  | { kind: "attempt"; attempts: number }
  | { kind: "stepFailure"; stepId: string }
  | { kind: "iterator"; itemCount: number; next: number }
  | { kind: "accumulator"; expected: number; done: number }
);

export type FlowNetPlacedToken = {
  path: FlowNetPath;
  token: FlowNetToken;
};

export type FlowNetFiring = {
  transitionPath: FlowNetPath;
  role: TransitionRole;
  /** The step run the transition fired for: a `forEach` step's own run for its iterating and collecting. */
  stepRun: FlowNetStepRun;
  consumed: FlowNetPlacedToken[];
  /** Tokens read through read arcs, which stay where they are. */
  read: FlowNetPlacedToken[];
  produced: FlowNetPlacedToken[];
};

/** What the net needs to know from outside to go on. */
export type FlowNetAwaiting =
  | { kind: "actionOutcome"; stepRun: FlowNetStepRun; attempt: number }
  | { kind: "itemCount"; stepRun: FlowNetStepRun }
  /** An action step that has its inputs, in a run that waits for steps to start (see `waitForStepStarts`). */
  | { kind: "stepStart"; stepRun: FlowNetStepRun };

export type FlowNetOutcome =
  | { kind: "itemCount"; stepRun: FlowNetStepRun; itemCount: number }
  | { kind: "stepStarted"; stepRun: FlowNetStepRun }
  | {
      kind: "attemptSucceeded";
      stepRun: FlowNetStepRun;
      /** The outputs the action produced. Any other output gets a token marked absent. */
      outputNames: string[];
    }
  | {
      kind: "attemptFailed";
      stepRun: FlowNetStepRun;
      /** Whether the action is tried again, which Temporal's retry policy decides. */
      retrying: boolean;
    };

export class FlowNetInterpreterError extends Error {
  override name = "FlowNetInterpreterError";
}

export type FlowNetRun = {
  /** The tokens the run started with: its flow inputs, and a `Pending` token for each top-level step. */
  readonly initialMarking: readonly FlowNetPlacedToken[];
  /** Every firing so far, in order. */
  readonly firings: readonly FlowNetFiring[];
  /** The tokens in the net now. */
  marking: () => FlowNetPlacedToken[];
  awaiting: () => FlowNetAwaiting[];
  /** Whether a step run is still waiting for its inputs: its `Pending` token is still there. */
  isPending: (stepRun: FlowNetStepRun) => boolean;
  /** Whether `awaiting()` lists a step run as waiting to be told it started, without listing every other one. */
  isAwaitingStart: (stepRun: FlowNetStepRun) => boolean;
  /** The attempt `awaiting()` lists a step run as waiting on the outcome of, if any, without listing every other one. */
  awaitedAttempt: (stepRun: FlowNetStepRun) => number | null;
  /**
   * Applies an outcome, then fires every transition it enables, and returns those firings.
   *
   * @throws {FlowNetInterpreterError} if the net isn't waiting for it.
   */
  apply: (outcome: FlowNetOutcome) => FlowNetFiring[];
};

const isPrefixOf = (prefix: number[], itemPath: number[]) =>
  prefix.length <= itemPath.length &&
  prefix.every((index, depth) => itemPath[depth] === index);

const isSameItemPath = (itemPath: number[], otherItemPath: number[]) =>
  itemPath.length === otherItemPath.length &&
  isPrefixOf(itemPath, otherItemPath);

/** The path an endpoint of an arc of the root net points at. */
const rootPath = (endpoint: ArcEndpoint): FlowNetPath =>
  endpoint.kind === "place"
    ? [endpoint.placeId]
    : [endpoint.componentInstanceId, endpoint.portPlaceId];
const placeIdOf = (key: string) => toPetrinautId(key);

/** The step an action's subnet runs for, in one of its instances. */
type InstanceScope = {
  instance: ComponentInstance;
  stepId: string;
  actionDefinition: ActionDefinition<FlowActionDefinitionId>;
  subnet: IndexedSubnet;
};

const pathIn = (scope: InstanceScope | null, id: string): FlowNetPath =>
  scope ? [scope.instance.id, id] : [id];

const instancePlaceName = (scope: InstanceScope, path: FlowNetPath) =>
  path.length === 2
    ? scope.subnet.subnet.places.find(({ id }) => id === path[1])?.name
    : undefined;

type IndexedSubnet = {
  subnet: Subnet;
  transitionsByRole: Map<TransitionRole, Transition>;
  /** The places `startAttempt` takes from: a port per input, or a `Start` port. */
  inputPortIds: string[];
  inProgressPlaceId: string;
};

/** A token an input arc of a firing takes or reads. */
type Binding = {
  arc: InputArc;
  path: FlowNetPath;
  token: FlowNetToken;
};

const roleOf = (transition: Transition): TransitionRole => {
  const role = transition.metadata?.role;

  if (typeof role !== "string") {
    throw new FlowNetInterpreterError(
      `Transition "${transition.name}" has no role`,
    );
  }

  return role as TransitionRole;
};

const singleOutputPlaceId = (transition: Transition) => {
  const [arc, ...otherArcs] = transition.outputArcs;
  const endpoint = arc ? getArcEndpoint(arc) : undefined;

  if (!endpoint || endpoint.kind !== "place" || otherArcs.length > 0) {
    throw new FlowNetInterpreterError(
      `Transition "${transition.name}" doesn't put a token in exactly one place`,
    );
  }

  return endpoint.placeId;
};

const indexSubnet = (subnet: Subnet): IndexedSubnet => {
  const transitionsByRole = new Map(
    subnet.transitions.map((transition) => [roleOf(transition), transition]),
  );

  const transitionWithRole = (role: TransitionRole) => {
    const transition = transitionsByRole.get(role);

    if (!transition) {
      throw new FlowNetInterpreterError(
        `Subnet "${subnet.name}" has no ${role} transition`,
      );
    }

    return transition;
  };

  return {
    subnet,
    transitionsByRole,
    inputPortIds: transitionWithRole("startAttempt").inputArcs.map((arc) => {
      const endpoint = getArcEndpoint(arc);

      if (endpoint.kind !== "place") {
        throw new FlowNetInterpreterError(
          `Subnet "${subnet.name}" starts an attempt from outside itself`,
        );
      }

      return endpoint.placeId;
    }),
    inProgressPlaceId: singleOutputPlaceId(transitionWithRole("startAttempt")),
  };
};

type RootTransition = { transition: Transition; metadata: TransitionMetadata };

/**
 * Starts a run of a compiled flow net: puts each flow input in its places (marked absent if the run wasn't
 * given it), and a `Pending` token in each top-level step's place, then fires every transition that enables.
 */
export const startFlowNetRun = (
  net: SDCPN,
  {
    flowInputNames,
    waitForStepStarts = false,
  }: {
    flowInputNames: Iterable<string>;
    /**
     * Whether an action step that has its inputs waits for a `stepStarted` outcome before it starts, rather than
     * starting at once. A replay waits, as the executor only starts the steps that are ready once every step it
     * started with the last batch has finished.
     */
    waitForStepStarts?: boolean;
  },
): FlowNetRun => {
  const { flowInputs, pendingAtStart } =
    (net.metadata as Partial<FlowNetMetadata> | undefined) ?? {};

  if (!flowInputs || !pendingAtStart) {
    throw new FlowNetInterpreterError("The net isn't a compiled flow net");
  }

  const subnetsById = new Map(
    (net.subnets ?? []).map((subnet) => [subnet.id, indexSubnet(subnet)]),
  );

  const rootTransitions: RootTransition[] = net.transitions.map(
    (transition) => ({
      transition,
      metadata: transition.metadata as TransitionMetadata,
    }),
  );

  const rootTransitionsByStep = new Map<string, RootTransition[]>();

  for (const rootTransition of rootTransitions) {
    const { metadata: transitionMetadata } = rootTransition;

    if (!("stepId" in transitionMetadata)) {
      throw new FlowNetInterpreterError(
        `Transition "${rootTransition.transition.name}" of the root net names no step`,
      );
    }

    rootTransitionsByStep.set(transitionMetadata.stepId, [
      ...(rootTransitionsByStep.get(transitionMetadata.stepId) ?? []),
      rootTransition,
    ]);
  }

  /* A step's instance is the one its `startStep` feeds. */
  const scopesByInstanceId = new Map<string, InstanceScope>();
  const scopesByStepId = new Map<string, InstanceScope>();

  for (const { transition, metadata: transitionMetadata } of rootTransitions) {
    if (transitionMetadata.role !== "startStep") {
      continue;
    }

    const [firstArc] = transition.outputArcs;
    const endpoint = firstArc ? getArcEndpoint(firstArc) : undefined;
    const instance =
      endpoint?.kind === "componentPort"
        ? net.componentInstances?.find(
            ({ id }) => id === endpoint.componentInstanceId,
          )
        : undefined;
    const subnet = instance ? subnetsById.get(instance.subnetId) : undefined;

    if (!instance || !subnet) {
      throw new FlowNetInterpreterError(
        `Step "${transitionMetadata.stepId}" starts no instance of a subnet`,
      );
    }

    const { actionDefinitionId } = instance.metadata as InstanceMetadata;
    const actionDefinition =
      actionDefinitions[actionDefinitionId as FlowActionDefinitionId];

    if (!(actionDefinitionId in actionDefinitions)) {
      throw new FlowNetInterpreterError(
        `Step "${transitionMetadata.stepId}" runs unknown action "${actionDefinitionId}"`,
      );
    }

    const scope: InstanceScope = {
      instance,
      stepId: transitionMetadata.stepId,
      actionDefinition,
      subnet,
    };

    scopesByInstanceId.set(instance.id, scope);
    scopesByStepId.set(transitionMetadata.stepId, scope);
  }

  const scopeOfStep = (stepId: string) => {
    const scope = scopesByStepId.get(stepId);

    if (!scope) {
      throw new FlowNetInterpreterError(
        `Step "${stepId}" isn't an action step`,
      );
    }

    return scope;
  };

  /*
   * The marking.
   */

  const tokensByPath = new Map<
    string,
    { path: FlowNetPath; tokens: FlowNetToken[] }
  >();

  const tokensAt = (path: FlowNetPath): readonly FlowNetToken[] =>
    tokensByPath.get(flowNetPathKey(path))?.tokens ?? [];

  const addToken = ({ path, token }: FlowNetPlacedToken) => {
    const key = flowNetPathKey(path);
    const entry = tokensByPath.get(key);

    if (entry) {
      entry.tokens.push(token);
    } else {
      tokensByPath.set(key, { path, tokens: [token] });
    }
  };

  const removeToken = ({ path, token }: FlowNetPlacedToken) => {
    const tokens = tokensByPath.get(flowNetPathKey(path))?.tokens;
    const index = tokens?.indexOf(token) ?? -1;

    if (!tokens || index === -1) {
      throw new FlowNetInterpreterError(
        `There is no such token at ${formatFlowNetPath(path)} to take`,
      );
    }

    tokens.splice(index, 1);
  };

  /*
   * Firing.
   */

  /** Where an endpoint of a transition's arc points, in the root net or inside an instance. */
  const pathOf = (
    endpoint: ArcEndpoint,
    scope: InstanceScope | null,
  ): FlowNetPath => {
    if (!scope) {
      return rootPath(endpoint);
    }

    if (endpoint.kind !== "place") {
      throw new FlowNetInterpreterError(
        `Subnet "${scope.subnet.subnet.name}" has an arc to a port of another instance`,
      );
    }

    return pathIn(scope, endpoint.placeId);
  };

  /**
   * The tokens a transition would take and read, with `anchor` as the token at `anchorPath`. Every other input
   * takes a token of the same item or of an enclosing one (`accepts` can say otherwise), and `guard` can refuse a
   * binding. Read arcs from one place can read the same token, but a token taken through a standard arc is bound to
   * that arc alone.
   */
  const bind = ({
    transition,
    scope,
    anchorPath,
    anchorAccepts = () => true,
    accepts = (anchor, candidate) =>
      isPrefixOf(candidate.itemPath, anchor.itemPath),
    guard = () => true,
  }: {
    transition: Transition;
    scope: InstanceScope | null;
    anchorPath: FlowNetPath;
    anchorAccepts?: (anchor: FlowNetToken) => boolean;
    accepts?: (anchor: FlowNetToken, candidate: FlowNetToken) => boolean;
    guard?: (bindings: Binding[]) => boolean;
  }): Binding[] | null => {
    const arcs = transition.inputArcs.map((arc) => ({
      arc,
      path: pathOf(getArcEndpoint(arc), scope),
    }));

    const anchorArc = arcs.find(({ path }) =>
      isSameFlowNetPath(path, anchorPath),
    );

    if (!anchorArc) {
      throw new FlowNetInterpreterError(
        `Transition "${transition.name}" takes nothing from ${formatFlowNetPath(anchorPath)}`,
      );
    }

    for (const anchor of tokensAt(anchorPath)) {
      if (!anchorAccepts(anchor)) {
        continue;
      }

      const bindings: Binding[] = [];

      for (const { arc, path } of arcs) {
        if (arc.type === "inhibitor") {
          throw new FlowNetInterpreterError(
            `Transition "${transition.name}" has an inhibitor arc`,
          );
        }

        const token =
          arc === anchorArc.arc
            ? anchor
            : tokensAt(path).find(
                (candidate) =>
                  accepts(anchor, candidate) &&
                  !bindings.some(
                    (binding) =>
                      binding.token === candidate &&
                      (arc.type === "standard" ||
                        binding.arc.type === "standard"),
                  ),
              );

        if (!token) {
          break;
        }

        bindings.push({ arc, path, token });
      }

      if (bindings.length === arcs.length && guard(bindings)) {
        return bindings;
      }
    }

    return null;
  };

  const firings: FlowNetFiring[] = [];

  /** Fires a transition with the tokens it's bound to, putting `produced` where its output arcs point. */
  const fire = ({
    transition,
    scope,
    stepRun,
    bindings,
    produce,
  }: {
    transition: Transition;
    scope: InstanceScope | null;
    stepRun: FlowNetStepRun;
    bindings: Binding[];
    /** The token each output arc puts in the place it points at. */
    produce: (path: FlowNetPath) => FlowNetToken;
  }): FlowNetFiring => {
    const consumed = bindings
      .filter(({ arc }) => arc.type === "standard")
      .map(({ path, token }) => ({ path, token }));

    const read = bindings
      .filter(({ arc }) => arc.type === "read")
      .map(({ path, token }) => ({ path, token }));

    for (const placedToken of consumed) {
      removeToken(placedToken);
    }

    /* Each token is an object of its own: bindings tell tokens apart by identity. */
    const produced = transition.outputArcs.map((arc) => {
      const path = pathOf(getArcEndpoint(arc), scope);

      return { path, token: { ...produce(path) } };
    });

    for (const placedToken of produced) {
      addToken(placedToken);
    }

    const firing: FlowNetFiring = {
      transitionPath: pathIn(scope, transition.id),
      role: roleOf(transition),
      stepRun,
      consumed,
      read,
      produced,
    };

    firings.push(firing);

    return firing;
  };

  const pendingPath = (stepId: string): FlowNetPath => [
    placeIdOf(generatePendingPlaceKey(stepId)),
  ];

  const iteratorPath = (forEachStepId: string): FlowNetPath => [
    placeIdOf(generateIteratorPlaceKey(forEachStepId)),
  ];

  const accumulatorPath = (forEachStepId: string): FlowNetPath => [
    placeIdOf(generateAccumulatorPlaceKey(forEachStepId)),
  ];

  const pendingPathKeys = new Set(
    [...rootTransitionsByStep.keys()].map((stepId) =>
      flowNetPathKey(pendingPath(stepId)),
    ),
  );

  const onlyInputPath = (transition: Transition) => {
    const [arc, ...otherArcs] = transition.inputArcs;

    if (!arc || otherArcs.length > 0) {
      throw new FlowNetInterpreterError(
        `Transition "${transition.name}" doesn't take from exactly one place`,
      );
    }

    return rootPath(getArcEndpoint(arc));
  };

  /** The token a `startStep` puts in each input port of its step's instance. */
  const startStepToken = (
    metadata: Extract<TransitionMetadata, { role: "startStep" }>,
    itemPath: number[],
    bindings: Binding[],
    portPath: FlowNetPath,
  ): FlowNetToken => {
    const scope = scopeOfStep(metadata.stepId);

    if (scope.actionDefinition.inputs.length === 0) {
      return { kind: "signal", itemPath };
    }

    const inputName = instancePlaceName(scope, portPath);
    const source = inputName ? metadata.inputSources[inputName] : undefined;

    if (!inputName || !source) {
      throw new FlowNetInterpreterError(
        `Step "${metadata.stepId}" feeds a port of its instance that isn't an input`,
      );
    }

    switch (source.kind) {
      case "value": {
        const binding = bindings.find(({ path }) =>
          isSameFlowNetPath(path, rootPath(source.from)),
        );

        if (binding?.token.kind !== "value") {
          throw new FlowNetInterpreterError(
            `Step "${metadata.stepId}" takes no value for its ${inputName} input`,
          );
        }

        return binding.token.present
          ? { kind: "value", present: true, ref: binding.token.ref, itemPath }
          : { kind: "value", present: false, itemPath };
      }
      case "constant":
        return {
          kind: "value",
          present: true,
          ref: { kind: "constant", stepId: metadata.stepId, inputName },
          itemPath,
        };
      case "default":
        return {
          kind: "value",
          present: true,
          ref: { kind: "default", stepId: metadata.stepId, inputName },
          itemPath,
        };
      case "absent":
        return { kind: "value", present: false, itemPath };
    }
  };

  /**
   * A step waits while a value it skips on when missing is missing: the executor fires its `skipStep` instead. Like
   * the executor, only a required input skips: a missing optional one leaves the step ready.
   */
  const hasMissingSkipInput = (
    metadata: Extract<TransitionMetadata, { role: "startStep" }>,
    bindings: Binding[],
  ) => {
    const { actionDefinition } = scopeOfStep(metadata.stepId);

    return Object.entries(metadata.inputSources).some(
      ([inputName, source]) =>
        source.kind === "value" &&
        source.whenMissing === "skip" &&
        actionDefinition.inputs.some(
          ({ name, required }) => name === inputName && required,
        ) &&
        bindings.some(
          ({ path, token }) =>
            isSameFlowNetPath(path, rootPath(source.from)) &&
            token.kind === "value" &&
            !token.present,
        ),
    );
  };

  /** A `forEach` step can't start while its array is missing. */
  const hasMissingArray = (bindings: Binding[]) =>
    bindings.some(({ token }) => token.kind === "value" && !token.present);

  const constantItemCount = (constant: JsonValue | undefined) => {
    if (constant === undefined) {
      return null;
    }

    const value =
      typeof constant === "object" && constant !== null && "value" in constant
        ? (constant as { value: JsonValue }).value
        : undefined;

    if (!Array.isArray(value)) {
      throw new FlowNetInterpreterError(
        "A forEach step iterates over a constant that isn't an array",
      );
    }

    return value.length;
  };

  /**
   * Fires a transition of the root net if it's enabled and fires on its own, returning the firing. Being `told` an
   * item count starts a `forEach` step whose array isn't a constant, and being told a step started starts an action
   * step in a run that waits for steps to start, for the outcome's step run.
   */
  const fireRootTransition = (
    { transition, metadata }: RootTransition,
    told?: Extract<FlowNetOutcome, { kind: "itemCount" | "stepStarted" }>,
  ): FlowNetFiring | null => {
    switch (metadata.role) {
      case "startStep": {
        if (waitForStepStarts && told?.kind !== "stepStarted") {
          return null;
        }

        const bindings = bind({
          transition,
          scope: null,
          anchorPath: pendingPath(metadata.stepId),
          anchorAccepts: (anchor) =>
            told?.kind !== "stepStarted" ||
            isSameItemPath(anchor.itemPath, told.stepRun.itemPath),
          guard: (candidate) => !hasMissingSkipInput(metadata, candidate),
        });

        if (!bindings) {
          return null;
        }

        const { itemPath } = bindings.find(({ path }) =>
          isSameFlowNetPath(path, pendingPath(metadata.stepId)),
        )!.token;

        return fire({
          transition,
          scope: null,
          stepRun: { stepId: metadata.stepId, itemPath },
          bindings,
          produce: (portPath) =>
            startStepToken(metadata, itemPath, bindings, portPath),
        });
      }
      case "startForEach": {
        const itemCount =
          constantItemCount(metadata.constant) ??
          (told?.kind === "itemCount" ? told.itemCount : null);

        if (itemCount === null) {
          return null;
        }

        const bindings = bind({
          transition,
          scope: null,
          anchorPath: pendingPath(metadata.stepId),
          anchorAccepts: (anchor) =>
            told?.kind !== "itemCount" ||
            isSameItemPath(anchor.itemPath, told.stepRun.itemPath),
          guard: (candidate) => !hasMissingArray(candidate),
        });

        if (!bindings) {
          return null;
        }

        const { itemPath } = bindings.find(({ path }) =>
          isSameFlowNetPath(path, pendingPath(metadata.stepId)),
        )!.token;

        return fire({
          transition,
          scope: null,
          stepRun: { stepId: metadata.stepId, itemPath },
          bindings,
          produce: () => ({ kind: "iterator", itemCount, next: 0, itemPath }),
        });
      }
      case "copyOutput":
      case "recordStepFailure": {
        const bindings = bind({
          transition,
          scope: null,
          anchorPath: onlyInputPath(transition),
        });

        if (!bindings) {
          return null;
        }

        const [{ token }] = bindings as [Binding];

        return fire({
          transition,
          scope: null,
          stepRun: { stepId: metadata.stepId, itemPath: token.itemPath },
          bindings,
          produce: () =>
            metadata.role === "copyOutput"
              ? token
              : {
                  kind: "stepFailure",
                  stepId: metadata.stepId,
                  itemPath: token.itemPath,
                },
        });
      }
      case "startItem":
      case "startCollecting": {
        const isStartItem = metadata.role === "startItem";
        const bindings = bind({
          transition,
          scope: null,
          anchorPath: iteratorPath(metadata.stepId),
          anchorAccepts: (anchor) =>
            anchor.kind === "iterator" &&
            (isStartItem
              ? anchor.next < anchor.itemCount
              : anchor.next === anchor.itemCount),
        });

        if (!bindings) {
          return null;
        }

        const [{ token: iterator }] = bindings as [Binding];

        if (iterator.kind !== "iterator") {
          throw new FlowNetInterpreterError("Unreachable: not an iterator");
        }

        const { itemPath, itemCount, next } = iterator;

        return fire({
          transition,
          scope: null,
          stepRun: { stepId: metadata.stepId, itemPath },
          bindings,
          produce: (path): FlowNetToken => {
            if (!isStartItem) {
              return {
                kind: "accumulator",
                expected: itemCount,
                done: 0,
                itemPath,
              };
            }

            const itemItemPath = [...itemPath, next];

            if (isSameFlowNetPath(path, iteratorPath(metadata.stepId))) {
              return { ...iterator, next: next + 1 };
            }

            if (pendingPathKeys.has(flowNetPathKey(path))) {
              return { kind: "pending", itemPath: itemItemPath };
            }

            return {
              kind: "value",
              present: true,
              ref: {
                kind: "item",
                forEachStepId: metadata.stepId,
                itemPath: itemItemPath,
              },
              itemPath: itemItemPath,
            };
          },
        });
      }
      case "collectItem": {
        const bindings = bind({
          transition,
          scope: null,
          anchorPath: accumulatorPath(metadata.stepId),
          anchorAccepts: (anchor) =>
            anchor.kind === "accumulator" && anchor.done < anchor.expected,
          accepts: (anchor, candidate) =>
            candidate.itemPath.length === anchor.itemPath.length + 1 &&
            isPrefixOf(anchor.itemPath, candidate.itemPath),
        });

        if (!bindings) {
          return null;
        }

        const accumulator = bindings.find(({ path }) =>
          isSameFlowNetPath(path, accumulatorPath(metadata.stepId)),
        )!.token;

        if (accumulator.kind !== "accumulator") {
          throw new FlowNetInterpreterError("Unreachable: not an accumulator");
        }

        return fire({
          transition,
          scope: null,
          stepRun: { stepId: metadata.stepId, itemPath: accumulator.itemPath },
          bindings,
          produce: () => ({ ...accumulator, done: accumulator.done + 1 }),
        });
      }
      case "finishCollecting": {
        const bindings = bind({
          transition,
          scope: null,
          anchorPath: accumulatorPath(metadata.stepId),
          anchorAccepts: (anchor) =>
            anchor.kind === "accumulator" && anchor.done === anchor.expected,
        });

        if (!bindings) {
          return null;
        }

        const [{ token: accumulator }] = bindings as [Binding];
        const { itemPath } = accumulator;

        return fire({
          transition,
          scope: null,
          stepRun: { stepId: metadata.stepId, itemPath },
          bindings,
          produce: () => ({
            kind: "value",
            present: true,
            ref: {
              kind: "collected",
              forEachStepId: metadata.stepId,
              itemPath,
            },
            itemPath,
          }),
        });
      }
      case "startAttempt":
      case "succeedAttempt":
      case "failAttempt":
      case "retryAttempt":
      case "giveUp":
        throw new FlowNetInterpreterError(
          `Transition "${transition.name}" of the root net has the role of an action's attempt`,
        );
    }
  };

  /** The transition with `role` in a step's instance. */
  const subnetTransition = (scope: InstanceScope, role: TransitionRole) => {
    const transition = scope.subnet.transitionsByRole.get(role);

    if (!transition) {
      throw new FlowNetInterpreterError(
        `Step "${scope.stepId}" has no ${role} transition`,
      );
    }

    return transition;
  };

  /** Fires `startAttempt` in a step's instance once every input port has its token. */
  const fireStartAttempt = (scope: InstanceScope): FlowNetFiring | null => {
    const transition = subnetTransition(scope, "startAttempt");
    const [firstPortId] = scope.subnet.inputPortIds;

    if (!firstPortId) {
      throw new FlowNetInterpreterError(
        `Step "${scope.stepId}" has no port to start from`,
      );
    }

    const bindings = bind({
      transition,
      scope,
      anchorPath: pathIn(scope, firstPortId),
      accepts: (anchor, candidate) =>
        isSameItemPath(anchor.itemPath, candidate.itemPath),
    });

    if (!bindings) {
      return null;
    }

    const [{ token }] = bindings as [Binding];

    return fire({
      transition,
      scope,
      stepRun: { stepId: scope.stepId, itemPath: token.itemPath },
      bindings,
      produce: () => ({
        kind: "attempt",
        attempts: 1,
        itemPath: token.itemPath,
      }),
    });
  };

  /** Fires every transition that's enabled and fires on its own, until none is. */
  const fireEnabled = (): FlowNetFiring[] => {
    const fired: FlowNetFiring[] = [];
    let firedAny = true;

    while (firedAny) {
      firedAny = false;

      for (const rootTransition of rootTransitions) {
        for (
          let firing = fireRootTransition(rootTransition);
          firing;
          firing = fireRootTransition(rootTransition)
        ) {
          fired.push(firing);
          firedAny = true;
        }
      }

      for (const scope of scopesByInstanceId.values()) {
        for (
          let firing = fireStartAttempt(scope);
          firing;
          firing = fireStartAttempt(scope)
        ) {
          fired.push(firing);
          firedAny = true;
        }
      }
    }

    return fired;
  };

  /** The token of a step run's attempt in progress. */
  const attemptInProgress = (stepRun: FlowNetStepRun) => {
    const scope = scopeOfStep(stepRun.stepId);
    const path = pathIn(scope, scope.subnet.inProgressPlaceId);
    const token = tokensAt(path).find(({ itemPath }) =>
      isSameItemPath(itemPath, stepRun.itemPath),
    );

    return token?.kind === "attempt" ? { scope, path, token } : null;
  };

  /** Fires a transition of an action's subnet that takes the one token `from`, producing `produce`'s token. */
  const fireAttemptTransition = ({
    scope,
    role,
    from,
    produce,
  }: {
    scope: InstanceScope;
    role: TransitionRole;
    from: FlowNetPlacedToken;
    produce: (path: FlowNetPath) => FlowNetToken;
  }) => {
    const transition = subnetTransition(scope, role);
    const [arc, ...otherArcs] = transition.inputArcs;

    if (
      !arc ||
      otherArcs.length > 0 ||
      !isSameFlowNetPath(pathOf(getArcEndpoint(arc), scope), from.path)
    ) {
      throw new FlowNetInterpreterError(
        `Step "${scope.stepId}"'s ${role} transition doesn't take the attempt's token`,
      );
    }

    return fire({
      transition,
      scope,
      stepRun: { stepId: scope.stepId, itemPath: from.token.itemPath },
      bindings: [{ arc, ...from }],
      produce,
    });
  };

  const applyOutcome = (outcome: FlowNetOutcome): FlowNetFiring[] => {
    const { stepRun } = outcome;

    switch (outcome.kind) {
      case "itemCount": {
        const startForEach = rootTransitionsByStep
          .get(stepRun.stepId)
          ?.find(({ metadata }) => metadata.role === "startForEach");
        const firing = startForEach
          ? fireRootTransition(startForEach, outcome)
          : null;

        if (!firing) {
          throw new FlowNetInterpreterError(
            `forEach step "${stepRun.stepId}" isn't waiting to start for item [${stepRun.itemPath.join(", ")}]`,
          );
        }

        return [firing];
      }
      case "stepStarted": {
        const startStep = rootTransitionsByStep
          .get(stepRun.stepId)
          ?.find(({ metadata }) => metadata.role === "startStep");
        const firing = startStep
          ? fireRootTransition(startStep, outcome)
          : null;

        if (!firing) {
          throw new FlowNetInterpreterError(
            `Step "${stepRun.stepId}" isn't waiting to start for item [${stepRun.itemPath.join(", ")}]`,
          );
        }

        return [firing];
      }
      case "attemptSucceeded":
      case "attemptFailed": {
        const attempt = attemptInProgress(stepRun);

        if (!attempt) {
          throw new FlowNetInterpreterError(
            `Step "${stepRun.stepId}" has no attempt in progress for item [${stepRun.itemPath.join(", ")}]`,
          );
        }

        const { scope, path, token } = attempt;
        const { itemPath } = token;

        if (outcome.kind === "attemptSucceeded") {
          const { outputs } = scope.actionDefinition;

          return [
            fireAttemptTransition({
              scope,
              role: "succeedAttempt",
              from: { path, token },
              produce: (outputPath): FlowNetToken => {
                if (outputs.length === 0) {
                  return { kind: "signal", itemPath };
                }

                const outputName = instancePlaceName(scope, outputPath);

                if (!outputName) {
                  throw new FlowNetInterpreterError(
                    `Step "${scope.stepId}" succeeds into a place that isn't an output`,
                  );
                }

                return outcome.outputNames.includes(outputName)
                  ? {
                      kind: "value",
                      present: true,
                      ref: {
                        kind: "stepOutput",
                        stepId: scope.stepId,
                        outputName,
                        itemPath,
                      },
                      itemPath,
                    }
                  : { kind: "value", present: false, itemPath };
              },
            }),
          ];
        }

        const failure = fireAttemptTransition({
          scope,
          role: "failAttempt",
          from: { path, token },
          produce: () => token,
        });
        const [failed] = failure.produced as [FlowNetPlacedToken];

        return [
          failure,
          fireAttemptTransition({
            scope,
            role: outcome.retrying ? "retryAttempt" : "giveUp",
            from: failed,
            produce: () => ({
              ...token,
              attempts: outcome.retrying ? token.attempts + 1 : token.attempts,
            }),
          }),
        ];
      }
    }
  };

  /*
   * Starting the run.
   */

  const givenFlowInputs = new Set(flowInputNames);

  const initialMarking: FlowNetPlacedToken[] = [
    ...Object.entries(flowInputs).flatMap(([inputName, endpoints]) =>
      endpoints.map((endpoint): FlowNetPlacedToken => ({
        path: rootPath(endpoint),
        token: givenFlowInputs.has(inputName)
          ? {
              kind: "value",
              present: true,
              ref: { kind: "flowInput", inputName },
              itemPath: [],
            }
          : { kind: "value", present: false, itemPath: [] },
      })),
    ),
    ...pendingAtStart.map((endpoint): FlowNetPlacedToken => ({
      path: rootPath(endpoint),
      token: { kind: "pending", itemPath: [] },
    })),
  ];

  for (const placedToken of initialMarking) {
    addToken(placedToken);
  }

  fireEnabled();

  return {
    initialMarking,
    firings,
    marking: () =>
      [...tokensByPath.values()].flatMap(({ path, tokens }) =>
        tokens.map((token) => ({ path, token })),
      ),
    awaiting: () => {
      const awaiting: FlowNetAwaiting[] = [];

      for (const scope of scopesByInstanceId.values()) {
        for (const token of tokensAt(
          pathIn(scope, scope.subnet.inProgressPlaceId),
        )) {
          if (token.kind === "attempt") {
            awaiting.push({
              kind: "actionOutcome",
              stepRun: { stepId: scope.stepId, itemPath: token.itemPath },
              attempt: token.attempts,
            });
          }
        }
      }

      /** The step runs whose `Pending` token `transition` could take, if told to. */
      const startableStepRuns = (
        { transition, metadata: transitionMetadata }: RootTransition,
        guard: (bindings: Binding[]) => boolean,
      ): FlowNetStepRun[] =>
        "stepId" in transitionMetadata
          ? tokensAt(pendingPath(transitionMetadata.stepId))
              .filter(
                (pending) =>
                  bind({
                    transition,
                    scope: null,
                    anchorPath: pendingPath(transitionMetadata.stepId),
                    anchorAccepts: (anchor) => anchor === pending,
                    guard,
                  }) !== null,
              )
              .map(({ itemPath }) => ({
                stepId: transitionMetadata.stepId,
                itemPath,
              }))
          : [];

      for (const rootTransition of rootTransitions) {
        const { metadata: transitionMetadata } = rootTransition;

        if (
          transitionMetadata.role === "startForEach" &&
          constantItemCount(transitionMetadata.constant) === null
        ) {
          for (const stepRun of startableStepRuns(
            rootTransition,
            (candidate) => !hasMissingArray(candidate),
          )) {
            awaiting.push({ kind: "itemCount", stepRun });
          }
        } else if (
          transitionMetadata.role === "startStep" &&
          waitForStepStarts
        ) {
          for (const stepRun of startableStepRuns(
            rootTransition,
            (candidate) => !hasMissingSkipInput(transitionMetadata, candidate),
          )) {
            awaiting.push({ kind: "stepStart", stepRun });
          }
        }
      }

      return awaiting;
    },
    isPending: (stepRun) =>
      tokensAt(pendingPath(stepRun.stepId)).some(({ itemPath }) =>
        isSameItemPath(itemPath, stepRun.itemPath),
      ),
    isAwaitingStart: (stepRun) => {
      if (!waitForStepStarts) {
        return false;
      }

      const pending = tokensAt(pendingPath(stepRun.stepId)).find(
        ({ itemPath }) => isSameItemPath(itemPath, stepRun.itemPath),
      );

      return (
        pending !== undefined &&
        (rootTransitionsByStep.get(stepRun.stepId) ?? []).some(
          ({ transition, metadata: transitionMetadata }) =>
            transitionMetadata.role === "startStep" &&
            bind({
              transition,
              scope: null,
              anchorPath: pendingPath(stepRun.stepId),
              anchorAccepts: (anchor) => anchor === pending,
              guard: (candidate) =>
                !hasMissingSkipInput(transitionMetadata, candidate),
            }) !== null,
        )
      );
    },
    awaitedAttempt: (stepRun) => {
      for (const scope of scopesByInstanceId.values()) {
        if (scope.stepId !== stepRun.stepId) {
          continue;
        }

        for (const token of tokensAt(
          pathIn(scope, scope.subnet.inProgressPlaceId),
        )) {
          if (
            token.kind === "attempt" &&
            isSameItemPath(token.itemPath, stepRun.itemPath)
          ) {
            return token.attempts;
          }
        }
      }

      return null;
    },
    apply: (outcome) => {
      const applied = applyOutcome(outcome);

      return [...applied, ...fireEnabled()];
    },
  };
};
