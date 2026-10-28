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
 * net's kernels are placeholders and it has no guards.
 *
 * Each transition is either internal or held:
 *
 * - An internal transition fires as soon as it's enabled. Nothing outside the net has a say in it: `startAttempt`,
 *   `copyOutput`, `startItem`, `startCollecting`, `collectItem`, `finishCollecting` and `recordStepFailure`.
 * - A held transition can be enabled and still not fire, because what happens outside the net decides whether it
 *   does (see `heldRoles`). The driver fires it: the replay of a run's events now, and the executor eventually.
 *   - `startForEach` needs to know how many items its array has, unless the array is a constant, when it's internal.
 *   - `startStep` is held only in a run that waits for steps to start (see `waitForStepStarts`).
 *   - `succeedAttempt` and `failAttempt` end an attempt in progress, as its action decides, and `succeedAttempt`
 *     needs to know which outputs the action produced.
 *   - `retryAttempt` and `giveUp` follow a failed attempt, as Temporal's retry policy decides. So a failure the
 *     policy retries is two firings: `failAttempt`, then `retryAttempt`.
 *
 * A role can therefore be held in one run and internal in another, but within a run it's the same for every step run.
 *
 * Driving a run is a loop: `held()` lists the held transitions that are enabled, each for one step run, and
 * `fire()` fires one of them, with what the net can't work out itself (`FlowNetHeldFiring`), and then every
 * internal transition that enables, until none is enabled. `startFlowNetRun` does the same with the run's starting
 * tokens. So between calls the net only ever waits on held transitions: a run whose `held()` is empty has ended,
 * or is stuck, such as on a step whose value to skip on is missing.
 *
 * An action step's attempts go round its instance of its action's subnet:
 *
 *   startStep ─▶ input ports ─▶ startAttempt ─▶ InProgress ─┬─▶ succeedAttempt ─▶ output ports
 *                                                  ▲        └─▶ failAttempt ─▶ Failed ─┬─▶ giveUp ─▶ GaveUp port
 *                                                  └──────────── retryAttempt ◀────────┘
 *
 * The attempt token counts the attempts: `startAttempt` makes the first, and each `retryAttempt` adds one. A step
 * that gives up puts its token in its instance's `GaveUp` port, which the internal `recordStepFailure` moves into
 * `FailedStepRuns`.
 *
 * A held transition fires for one step run, which says which tokens it takes: the `Pending` token of the step
 * run's item for a start, and the step run's attempt token for an attempt's end. Firing one that isn't enabled for
 * it throws a `FlowNetInterpreterError`, as does a net that isn't a compiled flow net.
 */

/** A run of a step: its id in the definition and, inside `forEach` steps, its item's index in each, outermost first. */
export type FlowNetStepRun = { stepId: string; itemPath: number[] };

/**
 * Where a token is: a place of the root net, or a place inside a step's instance of its action's subnet. Every
 * instance of a subnet shares its places' ids, so a place inside one is only identified with its instance.
 */
export type FlowNetPosition =
  | { kind: "place"; placeId: string }
  | { kind: "instancePlace"; componentInstanceId: string; placeId: string };

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
  position: FlowNetPosition;
  token: FlowNetToken;
};

export type FlowNetFiring = {
  transitionId: string;
  /** The instance a transition of an action's subnet fired in. */
  componentInstanceId?: string;
  role: TransitionRole;
  /** The step run the transition fired for: a `forEach` step's own run for its iterating and collecting. */
  stepRun: FlowNetStepRun;
  consumed: FlowNetPlacedToken[];
  /** Tokens read through read arcs, which stay where they are. */
  read: FlowNetPlacedToken[];
  produced: FlowNetPlacedToken[];
};

/**
 * The roles a held transition can have: one the driver fires, as what happens outside the net decides whether it
 * does. `succeedAttempt`, `failAttempt`, `retryAttempt` and `giveUp` are always held. `startForEach` is held unless
 * its array is a constant, and `startStep` only in a run that waits for steps to start (see `waitForStepStarts`).
 */
export const heldRoles = [
  "startForEach",
  "startStep",
  "succeedAttempt",
  "failAttempt",
  "retryAttempt",
  "giveUp",
] as const satisfies readonly TransitionRole[];

export type FlowNetHeldRole = (typeof heldRoles)[number];

type AttemptEndRole = Extract<
  FlowNetHeldRole,
  "succeedAttempt" | "failAttempt" | "retryAttempt" | "giveUp"
>;

/**
 * A held transition that's enabled, for one step run. A step run's `Pending` token enables its start once the step
 * has its inputs (a `forEach` step its array), its attempt in progress enables `succeedAttempt` and `failAttempt`,
 * and its failed attempt `retryAttempt` and `giveUp`. `attempt` is the number of the attempt that ends.
 */
export type FlowNetHeldTransition =
  | { role: "startForEach" | "startStep"; stepRun: FlowNetStepRun }
  | { role: AttemptEndRole; stepRun: FlowNetStepRun; attempt: number };

/**
 * What the driver fires a held transition for a step run with: what the net can't work out itself, which is how many
 * items a `forEach` step's array has, and which outputs a succeeding attempt produced.
 */
export type FlowNetHeldFiring =
  | { role: "startForEach"; stepRun: FlowNetStepRun; itemCount: number }
  | { role: "startStep"; stepRun: FlowNetStepRun }
  | {
      role: "succeedAttempt";
      stepRun: FlowNetStepRun;
      /** The outputs the action produced. Any other output gets a token marked absent. */
      outputNames: string[];
    }
  | {
      role: Exclude<AttemptEndRole, "succeedAttempt">;
      stepRun: FlowNetStepRun;
    };

/** The step run an attempt started for, and the value each of its action's inputs took (`null` if absent). */
export type FlowNetAttemptInputs = {
  stepRun: FlowNetStepRun;
  inputs: Record<string, FlowNetValueRef | null>;
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
  /** The held transitions that are enabled now: what the run waits on from outside. Attempts' ends come first. */
  held: () => FlowNetHeldTransition[];
  /**
   * Whether a held transition is enabled for a step run, without listing every other one, so that a replay of a
   * large `forEach` doesn't bind every item's `Pending` token on each event. False for a role that isn't held in this
   * run, such as `startStep` in a run that doesn't wait for steps to start.
   */
  isHeld: (role: FlowNetHeldRole, stepRun: FlowNetStepRun) => boolean;
  /** The number of a step run's attempt in progress, if it has one: not while it's failed and not yet retried. */
  attemptInProgress: (stepRun: FlowNetStepRun) => number | null;
  /** Whether a step run is still waiting for its inputs: its `Pending` token is still there. */
  isPending: (stepRun: FlowNetStepRun) => boolean;
  /**
   * The inputs a `startAttempt` firing started its action with: the tokens it took, one from each input port. An
   * executor finds the `startAttempt` firings among those `fire()` returns, and calls their actions with these.
   *
   * @throws {FlowNetInterpreterError} if the firing isn't of a `startAttempt`.
   */
  attemptInputs: (firing: FlowNetFiring) => FlowNetAttemptInputs;
  /**
   * Fires a held transition for its step run, then every internal transition that enables, until none is, and
   * returns those firings, the held one first.
   *
   * @throws {FlowNetInterpreterError} if it isn't enabled for the step run.
   */
  fire: (firing: FlowNetHeldFiring) => FlowNetFiring[];
};

const isPrefixOf = (prefix: number[], path: number[]) =>
  prefix.length <= path.length &&
  prefix.every((index, position) => path[position] === index);

const isSamePath = (path: number[], otherPath: number[]) =>
  path.length === otherPath.length && isPrefixOf(path, otherPath);

const positionKey = (position: FlowNetPosition) =>
  position.kind === "place"
    ? `place:${position.placeId}`
    : `instancePlace:${position.componentInstanceId}:${position.placeId}`;

const placePosition = (placeId: string): FlowNetPosition => ({
  kind: "place",
  placeId,
});

const instancePlacePosition = (
  componentInstanceId: string,
  placeId: string,
): FlowNetPosition => ({ kind: "instancePlace", componentInstanceId, placeId });

/** The position an endpoint of an arc of the root net points at. */
const rootPosition = (endpoint: ArcEndpoint): FlowNetPosition =>
  endpoint.kind === "place"
    ? placePosition(endpoint.placeId)
    : instancePlacePosition(endpoint.componentInstanceId, endpoint.portPlaceId);

const placeIdOf = (key: string) => toPetrinautId(key);

/** The step an action's subnet runs for, in one of its instances. */
type InstanceScope = {
  instance: ComponentInstance;
  stepId: string;
  actionDefinition: ActionDefinition<FlowActionDefinitionId>;
  subnet: IndexedSubnet;
};

type IndexedSubnet = {
  subnet: Subnet;
  transitionsByRole: Map<TransitionRole, Transition>;
  /** The places `startAttempt` takes from: a port per input, or a `Start` port. */
  inputPortIds: string[];
  inProgressPlaceId: string;
  failedPlaceId: string;
};

/** A token an input arc of a firing takes or reads. */
type Binding = {
  arc: InputArc;
  position: FlowNetPosition;
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
    failedPlaceId: singleOutputPlaceId(transitionWithRole("failAttempt")),
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
     * Whether an action step's `startStep` is held until the driver fires it, rather than firing once the step has
     * its inputs. A replay holds it, as the Temporal engine only starts the steps that are ready once every step it
     * started with the last batch has finished, so a step can have its inputs well before it starts.
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

  const tokensByPosition = new Map<
    string,
    { position: FlowNetPosition; tokens: FlowNetToken[] }
  >();

  const tokensAt = (position: FlowNetPosition): readonly FlowNetToken[] =>
    tokensByPosition.get(positionKey(position))?.tokens ?? [];

  const addToken = ({ position, token }: FlowNetPlacedToken) => {
    const key = positionKey(position);
    const entry = tokensByPosition.get(key);

    if (entry) {
      entry.tokens.push(token);
    } else {
      tokensByPosition.set(key, { position, tokens: [token] });
    }
  };

  const removeToken = ({ position, token }: FlowNetPlacedToken) => {
    const tokens = tokensByPosition.get(positionKey(position))?.tokens;
    const index = tokens?.indexOf(token) ?? -1;

    if (!tokens || index === -1) {
      throw new FlowNetInterpreterError(
        `There is no such token at ${positionKey(position)} to take`,
      );
    }

    tokens.splice(index, 1);
  };

  /*
   * Firing.
   */

  /** Where an endpoint of a transition's arc points, in the root net or inside an instance. */
  const positionOf = (endpoint: ArcEndpoint, scope: InstanceScope | null) => {
    if (!scope) {
      return rootPosition(endpoint);
    }

    if (endpoint.kind !== "place") {
      throw new FlowNetInterpreterError(
        `Subnet "${scope.subnet.subnet.name}" has an arc to a port of another instance`,
      );
    }

    return instancePlacePosition(scope.instance.id, endpoint.placeId);
  };

  /**
   * The tokens a transition would take and read, with `anchor` as the token at `anchorPosition`. Every other input
   * takes a token of the same item or of an enclosing one (`accepts` can say otherwise), and `guard` can refuse a
   * binding. Read arcs from one place can read the same token, but a token taken through a standard arc is bound to
   * that arc alone.
   */
  const bind = ({
    transition,
    scope,
    anchorPosition,
    anchorAccepts = () => true,
    accepts = (anchor, candidate) =>
      isPrefixOf(candidate.itemPath, anchor.itemPath),
    guard = () => true,
  }: {
    transition: Transition;
    scope: InstanceScope | null;
    anchorPosition: FlowNetPosition;
    anchorAccepts?: (anchor: FlowNetToken) => boolean;
    accepts?: (anchor: FlowNetToken, candidate: FlowNetToken) => boolean;
    guard?: (bindings: Binding[]) => boolean;
  }): Binding[] | null => {
    const arcs = transition.inputArcs.map((arc) => ({
      arc,
      position: positionOf(getArcEndpoint(arc), scope),
    }));

    const anchorArc = arcs.find(
      ({ position }) => positionKey(position) === positionKey(anchorPosition),
    );

    if (!anchorArc) {
      throw new FlowNetInterpreterError(
        `Transition "${transition.name}" takes nothing from ${positionKey(anchorPosition)}`,
      );
    }

    for (const anchor of tokensAt(anchorPosition)) {
      if (!anchorAccepts(anchor)) {
        continue;
      }

      const bindings: Binding[] = [];

      for (const { arc, position } of arcs) {
        if (arc.type === "inhibitor") {
          throw new FlowNetInterpreterError(
            `Transition "${transition.name}" has an inhibitor arc`,
          );
        }

        const token =
          arc === anchorArc.arc
            ? anchor
            : tokensAt(position).find(
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

        bindings.push({ arc, position, token });
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
    /** The token each output arc puts in the position it points at. */
    produce: (position: FlowNetPosition) => FlowNetToken;
  }): FlowNetFiring => {
    const consumed = bindings
      .filter(({ arc }) => arc.type === "standard")
      .map(({ position, token }) => ({ position, token }));

    const read = bindings
      .filter(({ arc }) => arc.type === "read")
      .map(({ position, token }) => ({ position, token }));

    for (const placedToken of consumed) {
      removeToken(placedToken);
    }

    /* Each token is an object of its own: bindings tell tokens apart by identity. */
    const produced = transition.outputArcs.map((arc) => {
      const position = positionOf(getArcEndpoint(arc), scope);

      return { position, token: { ...produce(position) } };
    });

    for (const placedToken of produced) {
      addToken(placedToken);
    }

    const firing: FlowNetFiring = {
      transitionId: transition.id,
      ...(scope ? { componentInstanceId: scope.instance.id } : {}),
      role: roleOf(transition),
      stepRun,
      consumed,
      read,
      produced,
    };

    firings.push(firing);

    return firing;
  };

  const pendingPosition = (stepId: string) =>
    placePosition(placeIdOf(generatePendingPlaceKey(stepId)));

  const iteratorPosition = (forEachStepId: string) =>
    placePosition(placeIdOf(generateIteratorPlaceKey(forEachStepId)));

  const accumulatorPosition = (forEachStepId: string) =>
    placePosition(placeIdOf(generateAccumulatorPlaceKey(forEachStepId)));

  const pendingPositionKeys = new Set(
    [...rootTransitionsByStep.keys()].map((stepId) =>
      positionKey(pendingPosition(stepId)),
    ),
  );

  const onlyInputPosition = (transition: Transition) => {
    const [arc, ...otherArcs] = transition.inputArcs;

    if (!arc || otherArcs.length > 0) {
      throw new FlowNetInterpreterError(
        `Transition "${transition.name}" doesn't take from exactly one place`,
      );
    }

    return rootPosition(getArcEndpoint(arc));
  };

  const isAt = (position: FlowNetPosition, otherPosition: FlowNetPosition) =>
    positionKey(position) === positionKey(otherPosition);

  /** The token a `startStep` puts in each input port of its step's instance. */
  const startStepToken = (
    metadata: Extract<TransitionMetadata, { role: "startStep" }>,
    itemPath: number[],
    bindings: Binding[],
    position: FlowNetPosition,
  ): FlowNetToken => {
    const scope = scopeOfStep(metadata.stepId);

    if (scope.actionDefinition.inputs.length === 0) {
      return { kind: "signal", itemPath };
    }

    const port =
      position.kind === "instancePlace"
        ? scope.subnet.subnet.places.find(({ id }) => id === position.placeId)
        : undefined;
    const inputName = port?.name;
    const source = inputName ? metadata.inputSources[inputName] : undefined;

    if (!inputName || !source) {
      throw new FlowNetInterpreterError(
        `Step "${metadata.stepId}" feeds a port of its instance that isn't an input`,
      );
    }

    switch (source.kind) {
      case "value": {
        const binding = bindings.find(({ position: boundPosition }) =>
          isAt(boundPosition, rootPosition(source.from)),
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
          ({ position, token }) =>
            isAt(position, rootPosition(source.from)) &&
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
   * Fires a transition of the root net if it's enabled, returning the firing. A held `startForEach` or `startStep`
   * only fires as `fired`, the driver's firing of it, and only for `fired`'s step run.
   */
  const fireRootTransition = (
    { transition, metadata }: RootTransition,
    fired?: Extract<FlowNetHeldFiring, { role: "startForEach" | "startStep" }>,
  ): FlowNetFiring | null => {
    switch (metadata.role) {
      case "startStep": {
        if (waitForStepStarts && fired?.role !== "startStep") {
          return null;
        }

        const bindings = bind({
          transition,
          scope: null,
          anchorPosition: pendingPosition(metadata.stepId),
          anchorAccepts: (anchor) =>
            fired?.role !== "startStep" ||
            isSamePath(anchor.itemPath, fired.stepRun.itemPath),
          guard: (candidate) => !hasMissingSkipInput(metadata, candidate),
        });

        if (!bindings) {
          return null;
        }

        const { itemPath } = bindings.find(({ position }) =>
          isAt(position, pendingPosition(metadata.stepId)),
        )!.token;

        return fire({
          transition,
          scope: null,
          stepRun: { stepId: metadata.stepId, itemPath },
          bindings,
          produce: (position) =>
            startStepToken(metadata, itemPath, bindings, position),
        });
      }
      case "startForEach": {
        const itemCount =
          constantItemCount(metadata.constant) ??
          (fired?.role === "startForEach" ? fired.itemCount : null);

        if (itemCount === null) {
          return null;
        }

        const bindings = bind({
          transition,
          scope: null,
          anchorPosition: pendingPosition(metadata.stepId),
          anchorAccepts: (anchor) =>
            fired?.role !== "startForEach" ||
            isSamePath(anchor.itemPath, fired.stepRun.itemPath),
          guard: (candidate) => !hasMissingArray(candidate),
        });

        if (!bindings) {
          return null;
        }

        const { itemPath } = bindings.find(({ position }) =>
          isAt(position, pendingPosition(metadata.stepId)),
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
          anchorPosition: onlyInputPosition(transition),
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
          anchorPosition: iteratorPosition(metadata.stepId),
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
          produce: (position): FlowNetToken => {
            if (!isStartItem) {
              return {
                kind: "accumulator",
                expected: itemCount,
                done: 0,
                itemPath,
              };
            }

            const itemItemPath = [...itemPath, next];

            if (isAt(position, iteratorPosition(metadata.stepId))) {
              return { ...iterator, next: next + 1 };
            }

            if (pendingPositionKeys.has(positionKey(position))) {
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
          anchorPosition: accumulatorPosition(metadata.stepId),
          anchorAccepts: (anchor) =>
            anchor.kind === "accumulator" && anchor.done < anchor.expected,
          accepts: (anchor, candidate) =>
            candidate.itemPath.length === anchor.itemPath.length + 1 &&
            isPrefixOf(anchor.itemPath, candidate.itemPath),
        });

        if (!bindings) {
          return null;
        }

        const accumulator = bindings.find(({ position }) =>
          isAt(position, accumulatorPosition(metadata.stepId)),
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
          anchorPosition: accumulatorPosition(metadata.stepId),
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
      anchorPosition: instancePlacePosition(scope.instance.id, firstPortId),
      accepts: (anchor, candidate) =>
        isSamePath(anchor.itemPath, candidate.itemPath),
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

  /** Fires every internal transition that's enabled, until none is. */
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

  /**
   * A step run's attempt token in a place of its step's instance: `InProgress` while an attempt is in progress, and
   * `Failed` once it failed, until it's retried or given up on.
   */
  const attemptTokenAt = (
    stepRun: FlowNetStepRun,
    placeOf: (subnet: IndexedSubnet) => string,
  ) => {
    const scope = scopeOfStep(stepRun.stepId);
    const position = instancePlacePosition(
      scope.instance.id,
      placeOf(scope.subnet),
    );
    const token = tokensAt(position).find(({ itemPath }) =>
      isSamePath(itemPath, stepRun.itemPath),
    );

    return token?.kind === "attempt" ? { scope, position, token } : null;
  };

  const inProgressToken = (stepRun: FlowNetStepRun) =>
    attemptTokenAt(stepRun, ({ inProgressPlaceId }) => inProgressPlaceId);

  const failedToken = (stepRun: FlowNetStepRun) =>
    attemptTokenAt(stepRun, ({ failedPlaceId }) => failedPlaceId);

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
    produce: (position: FlowNetPosition) => FlowNetToken;
  }) => {
    const transition = subnetTransition(scope, role);
    const [arc, ...otherArcs] = transition.inputArcs;

    if (
      !arc ||
      otherArcs.length > 0 ||
      !isAt(positionOf(getArcEndpoint(arc), scope), from.position)
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

  const describeStepRun = ({ stepId, itemPath }: FlowNetStepRun) =>
    `Step "${stepId}" for item [${itemPath.join(", ")}]`;

  const attemptToEnd = (stepRun: FlowNetStepRun) => {
    const attempt = inProgressToken(stepRun);

    if (!attempt) {
      throw new FlowNetInterpreterError(
        `${describeStepRun(stepRun)} has no attempt in progress`,
      );
    }

    return attempt;
  };

  /** Fires a held transition for its step run, without the internal transitions it enables. */
  const fireHeld = (held: FlowNetHeldFiring): FlowNetFiring => {
    const { stepRun } = held;

    switch (held.role) {
      case "startForEach":
      case "startStep": {
        const rootTransition = rootTransitionsByStep
          .get(stepRun.stepId)
          ?.find(({ metadata }) => metadata.role === held.role);
        const firing = rootTransition
          ? fireRootTransition(rootTransition, held)
          : null;

        if (!firing) {
          throw new FlowNetInterpreterError(
            `${describeStepRun(stepRun)} can't ${held.role} now`,
          );
        }

        return firing;
      }
      case "failAttempt": {
        const { scope, position, token } = attemptToEnd(stepRun);

        return fireAttemptTransition({
          scope,
          role: "failAttempt",
          from: { position, token },
          produce: () => token,
        });
      }
      case "succeedAttempt": {
        const { scope, position, token } = attemptToEnd(stepRun);
        const { itemPath } = token;
        const { outputs } = scope.actionDefinition;
        const { outputNames } = held;

        return fireAttemptTransition({
          scope,
          role: "succeedAttempt",
          from: { position, token },
          produce: (outputPosition): FlowNetToken => {
            if (outputs.length === 0) {
              return { kind: "signal", itemPath };
            }

            const outputName =
              outputPosition.kind === "instancePlace"
                ? scope.subnet.subnet.places.find(
                    ({ id }) => id === outputPosition.placeId,
                  )?.name
                : undefined;

            if (!outputName) {
              throw new FlowNetInterpreterError(
                `Step "${scope.stepId}" succeeds into a place that isn't an output`,
              );
            }

            return outputNames.includes(outputName)
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
        });
      }
      case "retryAttempt":
      case "giveUp": {
        const failed = failedToken(stepRun);

        if (!failed) {
          throw new FlowNetInterpreterError(
            `${describeStepRun(stepRun)} has no failed attempt`,
          );
        }

        const { scope, position, token } = failed;

        return fireAttemptTransition({
          scope,
          role: held.role,
          from: { position, token },
          produce: () => ({
            ...token,
            attempts:
              held.role === "retryAttempt"
                ? token.attempts + 1
                : token.attempts,
          }),
        });
      }
    }
  };

  /**
   * The step runs a root transition is held and enabled for, only `forItemPath`'s if given. Only a `startForEach`
   * whose array isn't a constant, and a `startStep` in a run that waits for steps to start, are held.
   */
  const heldStarts = (
    { transition, metadata: transitionMetadata }: RootTransition,
    forItemPath?: number[],
  ): FlowNetHeldTransition[] => {
    if (
      !(
        (transitionMetadata.role === "startForEach" &&
          constantItemCount(transitionMetadata.constant) === null) ||
        (transitionMetadata.role === "startStep" && waitForStepStarts)
      )
    ) {
      return [];
    }

    const { role, stepId } = transitionMetadata;

    return tokensAt(pendingPosition(stepId))
      .filter(
        (pending) =>
          (forItemPath === undefined ||
            isSamePath(pending.itemPath, forItemPath)) &&
          bind({
            transition,
            scope: null,
            anchorPosition: pendingPosition(stepId),
            anchorAccepts: (anchor) => anchor === pending,
            guard: (candidate) =>
              transitionMetadata.role === "startForEach"
                ? !hasMissingArray(candidate)
                : !hasMissingSkipInput(transitionMetadata, candidate),
          }) !== null,
      )
      .map(({ itemPath }) => ({ role, stepRun: { stepId, itemPath } }));
  };

  /*
   * Starting the run.
   */

  const givenFlowInputs = new Set(flowInputNames);

  const initialMarking: FlowNetPlacedToken[] = [
    ...Object.entries(flowInputs).flatMap(([inputName, endpoints]) =>
      endpoints.map((endpoint): FlowNetPlacedToken => ({
        position: rootPosition(endpoint),
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
      position: rootPosition(endpoint),
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
      [...tokensByPosition.values()].flatMap(({ position, tokens }) =>
        tokens.map((token) => ({ position, token })),
      ),
    held: () => {
      const held: FlowNetHeldTransition[] = [];

      for (const scope of scopesByInstanceId.values()) {
        for (const [placeId, roles] of [
          [scope.subnet.inProgressPlaceId, ["succeedAttempt", "failAttempt"]],
          [scope.subnet.failedPlaceId, ["retryAttempt", "giveUp"]],
        ] as const) {
          for (const token of tokensAt(
            instancePlacePosition(scope.instance.id, placeId),
          )) {
            if (token.kind === "attempt") {
              const stepRun = {
                stepId: scope.stepId,
                itemPath: token.itemPath,
              };

              for (const role of roles) {
                held.push({ role, stepRun, attempt: token.attempts });
              }
            }
          }
        }
      }

      return [
        ...held,
        ...rootTransitions.flatMap((rootTransition) =>
          heldStarts(rootTransition),
        ),
      ];
    },
    isHeld: (role, stepRun) => {
      switch (role) {
        case "startForEach":
        case "startStep":
          return (rootTransitionsByStep.get(stepRun.stepId) ?? []).some(
            (rootTransition) =>
              rootTransition.metadata.role === role &&
              heldStarts(rootTransition, stepRun.itemPath).length > 0,
          );
        case "succeedAttempt":
        case "failAttempt":
          return (
            scopesByStepId.has(stepRun.stepId) &&
            inProgressToken(stepRun) !== null
          );
        case "retryAttempt":
        case "giveUp":
          return (
            scopesByStepId.has(stepRun.stepId) && failedToken(stepRun) !== null
          );
      }
    },
    attemptInProgress: (stepRun) =>
      scopesByStepId.has(stepRun.stepId)
        ? (inProgressToken(stepRun)?.token.attempts ?? null)
        : null,
    isPending: (stepRun) =>
      tokensAt(pendingPosition(stepRun.stepId)).some(({ itemPath }) =>
        isSamePath(itemPath, stepRun.itemPath),
      ),
    attemptInputs: (firing) => {
      if (firing.role !== "startAttempt") {
        throw new FlowNetInterpreterError(
          `A ${firing.role} firing doesn't start an attempt`,
        );
      }

      const scope = scopeOfStep(firing.stepRun.stepId);

      /* An action with no inputs starts from a `Start` port's signal. */
      if (scope.actionDefinition.inputs.length === 0) {
        return { stepRun: firing.stepRun, inputs: {} };
      }

      const { subnet } = scope.subnet;

      const inputs: FlowNetAttemptInputs["inputs"] = {};

      for (const { position, token } of firing.consumed) {
        const inputName =
          position.kind === "instancePlace"
            ? subnet.places.find(({ id }) => id === position.placeId)?.name
            : undefined;

        if (!inputName || token.kind !== "value") {
          throw new FlowNetInterpreterError(
            `${describeStepRun(firing.stepRun)} started from a token that isn't an input's value`,
          );
        }

        inputs[inputName] = token.present ? token.ref : null;
      }

      return { stepRun: firing.stepRun, inputs };
    },
    fire: (held) => [fireHeld(held), ...fireEnabled()],
  };
};
