/**
 * The checks on a net's fusions: every member names a port or a place that
 * exists and belongs to this fusion alone, the members agree on what the
 * fused place is, no transition reaches the fused place twice, and a fused
 * flow has somewhere to come from and somewhere to go. Run on a document as
 * the editor shows it, before flattening, one fusion and one net at a time.
 * Flattening throws on each of the errors too, apart from a member listed
 * twice and a fusion with fewer than two members, which merge nothing. It
 * merges across nested instances as well, and can refuse what no single
 * fusion shows: `place-fusion.mdx` lists those cases.
 */

import { arcMatchesEndpoint } from "../arc-endpoints";
import { getRunningEquationIds } from "../place-dynamics";
import {
  colorsStructurallyEqual,
  describeResolvedMember,
  equationKey,
  fusionHolds,
  fusionMemberIssues,
  resolveFusionMember,
  type FusionNet,
  type ResolvedFusionMember,
} from "./fusions";
import {
  bindingKey,
  indexDocument,
  resolveRunningPorts,
  type DocumentIndex,
  type InstanceBinding,
  type RunningPort,
} from "./interfaces";
import {
  endpointUsage,
  portUsages,
  type PortNet,
  type PortUsage,
} from "./ports";

import type {
  ArcEndpoint,
  Color,
  Component,
  Fusion,
  ID,
  InputArc,
  OutputArc,
  Place,
  SDCPN,
  Transition,
} from "../types/sdcpn";
import type { ResolvedLibraries } from "./libraries";

export type FusionProblemCode =
  | "unresolved-member"
  | "duplicate-member"
  | "shared-member"
  | "multiple-anchors"
  | "too-few-members"
  | "color-mismatch"
  | "capacity-mismatch"
  | "dynamics-conflict"
  | "repeated-arc"
  | "no-producer"
  | "no-consumer";

export type ProblemSeverity = "error" | "warning" | "info";

const severityOf: Record<FusionProblemCode, ProblemSeverity> = {
  "unresolved-member": "error",
  "duplicate-member": "error",
  "shared-member": "error",
  "multiple-anchors": "error",
  "too-few-members": "error",
  "color-mismatch": "error",
  "capacity-mismatch": "error",
  "dynamics-conflict": "error",
  "repeated-arc": "error",
  "no-producer": "warning",
  "no-consumer": "info",
};

export type FusionProblem = {
  kind: "fusion";
  /** The component the fusion belongs to; `null` for the root net. */
  componentId: ID | null;
  fusionId: ID;
  code: FusionProblemCode;
  severity: ProblemSeverity;
  message: string;
};

type CheckedNet = FusionNet & Pick<SDCPN, "types" | "transitions">;

/** Whether tokens can enter and leave the fused place by way of one member. */
type TokenFlow = { produced: boolean; consumed: boolean };

/**
 * What a check of many fusions reads once, whatever their number. Without
 * one, `checkFusion` reads it for the fusion it is given.
 */
export type FusionCheckPass = {
  /**
   * How a net's own transitions touch its ports. `netKey` names the net: the
   * `componentKey` of a component, `null` for the root net. Of two components
   * with one id the first asked about is read, as a search of the document
   * finds it.
   */
  portUsagesOf: (
    netKey: string | null,
    net: PortNet,
  ) => (placeId: ID) => PortUsage;
  /**
   * The place that runs for a port of `instance`: see `resolveRunningPorts`.
   * What runs is resolved once for the instances bound alike.
   */
  runningPortOf: (
    instance: InstanceBinding,
    declared: { component: Component; place: Place },
  ) => RunningPort;
};

/** `libraries` are the ones the document's imports resolved to. */
export const fusionCheckPass = (
  sdcpn: Pick<SDCPN, "components" | "implementations">,
  libraries?: ResolvedLibraries,
): FusionCheckPass => {
  const usagesByNetKey = new Map<string | null, (placeId: ID) => PortUsage>();
  let index: DocumentIndex | undefined;
  const runningPortsByBinding = new Map<
    string,
    ReturnType<typeof resolveRunningPorts>
  >();
  return {
    runningPortOf: (instance, declared) => {
      const key = bindingKey(instance);
      let runningPorts = runningPortsByBinding.get(key);
      if (!runningPorts) {
        index ??= indexDocument(sdcpn);
        runningPorts = resolveRunningPorts(sdcpn, instance, libraries, index);
        runningPortsByBinding.set(key, runningPorts);
      }
      return runningPorts(declared);
    },
    portUsagesOf: (netKey, net) => {
      const known = usagesByNetKey.get(netKey);
      if (known) {
        return known;
      }
      const usageOf = portUsages(net);
      usagesByNetKey.set(netKey, usageOf);
      return usageOf;
    },
  };
};

/**
 * What a net does with one of its own ports: what the port declares, else
 * what the net's arcs move through it. A port no transition touches passes
 * tokens through, so it counts as both.
 */
const ownPortFlow = (
  port: Pick<Place, "id" | "portDirection">,
  /** How the port's net touches its ports: asked for a port that declares no direction. */
  usagesOfNet: () => (placeId: ID) => PortUsage,
): TokenFlow => {
  if (port.portDirection !== undefined) {
    return {
      produced: port.portDirection !== "in",
      consumed: port.portDirection !== "out",
    };
  }
  const { touched, ...flow } = usagesOfNet()(port.id);
  return touched ? flow : { produced: true, consumed: true };
};

/**
 * What is on the far side of a member from this net's transitions: the
 * component's own flow, for an instance port, under the direction its
 * interface declares when it has one. For an anchor that is itself a port of
 * this net it is the net above, which does with the port the opposite of
 * what this net does.
 */
const farSideFlow = (
  net: CheckedNet,
  componentId: ID | null,
  resolved: ResolvedFusionMember,
  /** The place that runs for an instance port; `null` for an anchor. */
  running: RunningPort | null,
  pass: FusionCheckPass,
): TokenFlow => {
  if (running) {
    return ownPortFlow(
      {
        id: running.place.id,
        portDirection:
          resolved.place.portDirection ?? running.place.portDirection,
      },
      () => pass.portUsagesOf(running.key, running.component),
    );
  }
  if (!resolved.place.isPort) {
    return { produced: false, consumed: false };
  }
  const own = ownPortFlow(resolved.place, () =>
    pass.portUsagesOf(componentId, net),
  );
  return { produced: own.consumed, consumed: own.produced };
};

type MemberFacts = TokenFlow & {
  label: string;
  color: Color | undefined;
  capacity: number | null;
  /** The equations the member runs, in order, each by its `equationKey`. */
  dynamicsKey: string | null;
};

const factsFor = (
  net: CheckedNet,
  componentId: ID | null,
  member: ArcEndpoint,
  resolved: ResolvedFusionMember,
  pass: FusionCheckPass,
): Omit<MemberFacts, "label"> => {
  // An instance port is the place that runs for it: for an instance of an
  // interface, the bound implementation's port, which the flattener merges.
  const running =
    resolved.kind === "port"
      ? pass.runningPortOf(resolved.instance, resolved)
      : null;
  const place = running?.place ?? resolved.place;
  const types = running ? running.component.types : net.types;
  // A place runs equations of its own net, which `key` tells from a
  // library's component under the same id.
  const equationNetKey = running ? running.key : componentId;
  const equationIds = getRunningEquationIds(place);
  const outside = endpointUsage(net.transitions, member);
  const inside = farSideFlow(net, componentId, resolved, running, pass);
  return {
    color: place.colorId
      ? types.find(({ id }) => id === place.colorId)
      : undefined,
    capacity: place.capacity ?? null,
    dynamicsKey:
      equationIds.length > 0
        ? JSON.stringify(
            equationIds.map((id) => equationKey(equationNetKey, id)),
          )
        : null,
    produced: outside.produced || inside.produced,
    consumed: outside.consumed || inside.consumed,
  };
};

/** The transitions of `net` with two arcs of one kind onto members of `fusion`. */
const transitionsReachingTwice = (
  net: CheckedNet,
  fusion: Fusion,
): Transition[] => {
  const reaches = (arc: InputArc | OutputArc) =>
    fusion.members.some((member) => arcMatchesEndpoint(arc, member));
  return net.transitions.filter(({ inputArcs, outputArcs }) => {
    const inputKinds = inputArcs.filter(reaches).map(({ type }) => type);
    return (
      new Set(inputKinds).size < inputKinds.length ||
      outputArcs.filter(reaches).length > 1
    );
  });
};

/**
 * Whether a member is a port of a component whose import is not among
 * `libraries`: one that is still resolving, or that failed.
 */
const awaitsImport = (
  net: FusionNet,
  member: ArcEndpoint,
  libraries: ResolvedLibraries | undefined,
): boolean => {
  if (member.kind !== "componentPort") {
    return false;
  }
  const from = net.componentInstances?.find(
    ({ id }) => id === member.componentInstanceId,
  )?.component?.from;
  return from !== undefined && libraries?.has(from) !== true;
};

/**
 * The problems with one fusion of `net`. `libraries` are the ones the
 * document's imports resolved to. A fusion with a port of a component whose
 * import is not among them is checked on its list of members alone: what its
 * members are cannot be read, and the import is reported by its own check.
 * A caller that checks many fusions of one document hands each call the
 * same `pass`, made for the same libraries.
 */
export const checkFusion = (
  sdcpn: Pick<SDCPN, "components" | "implementations">,
  net: CheckedNet,
  fusion: Fusion,
  componentId: ID | null,
  libraries?: ResolvedLibraries,
  pass: FusionCheckPass = fusionCheckPass(sdcpn, libraries),
): FusionProblem[] => {
  const problems: FusionProblem[] = [];
  const fusionName = `the fusion ${fusion.name}`;
  const report = (code: FusionProblemCode, message: string) =>
    problems.push({
      kind: "fusion",
      componentId,
      fusionId: fusion.id,
      code,
      severity: severityOf[code],
      message,
    });

  if (fusion.members.length < 2) {
    report(
      "too-few-members",
      `A fusion needs at least two members: ${fusionName} has fewer.`,
    );
  }

  const { duplicates, multipleAnchors } = fusionMemberIssues(fusion.members);
  const facts: MemberFacts[] = [];
  let unreadable = false;
  for (const [index, member] of fusion.members.entries()) {
    const resolved = resolveFusionMember(sdcpn, net, member, libraries);
    const label = describeResolvedMember(member, resolved);
    if (duplicates.includes(index)) {
      report("duplicate-member", `${label} is listed twice in ${fusionName}.`);
      continue;
    }
    const elsewhere = (net.fusions ?? []).some(
      (other) => other.id !== fusion.id && fusionHolds(other, member),
    );
    if (elsewhere) {
      report(
        "shared-member",
        `${label} is in ${fusionName} and in another fusion of this net: a place or port belongs to one fusion.`,
      );
    }
    if (resolved === null) {
      if (awaitsImport(net, member, libraries)) {
        unreadable = true;
        continue;
      }
      report(
        "unresolved-member",
        member.kind === "place"
          ? `A member of ${fusionName} is a place that no longer exists.`
          : `${label}, a member of ${fusionName}, is not a port of an instance in this net.`,
      );
      continue;
    }
    facts.push({
      label,
      ...factsFor(net, componentId, member, resolved, pass),
    });
  }
  if (multipleAnchors) {
    report(
      "multiple-anchors",
      `More than one place of this net is in ${fusionName}; fuse ports into one place instead.`,
    );
  }
  for (const transition of transitionsReachingTwice(net, fusion)) {
    report(
      "repeated-arc",
      `Transition ${transition.name} reaches ${fusionName} through two arcs of the same kind. Keep one of them.`,
    );
  }

  const [first, ...rest] = facts;
  if (!first || unreadable) {
    return problems;
  }
  const mistyped = rest.find(
    (other) => !colorsStructurallyEqual(first.color, other.color),
  );
  if (mistyped) {
    report(
      "color-mismatch",
      `${first.label} and ${mistyped.label} hold different token types, so they cannot be one place.`,
    );
  }
  const capacities = new Set(
    facts
      .map(({ capacity }) => capacity)
      .filter((capacity) => capacity !== null),
  );
  if (capacities.size > 1) {
    report(
      "capacity-mismatch",
      `The places in ${fusionName} have different token capacities (${[...capacities].join(", ")}).`,
    );
  }
  const dynamics = new Set(
    facts
      .map(({ dynamicsKey }) => dynamicsKey)
      .filter((dynamicsKey) => dynamicsKey !== null),
  );
  if (dynamics.size > 1) {
    report(
      "dynamics-conflict",
      `The places in ${fusionName} run different differential equations; the members with dynamics must compose the same equations.`,
    );
  }
  if (!facts.some(({ produced }) => produced)) {
    report(
      "no-producer",
      `Nothing puts tokens into ${fusionName}: every member only consumes from it, so it holds only its initial marking.`,
    );
  }
  if (!facts.some(({ consumed }) => consumed)) {
    report(
      "no-consumer",
      `Nothing takes tokens out of ${fusionName}: every member only produces into it, so it accumulates.`,
    );
  }
  return problems;
};

const checkNetFusions = (
  sdcpn: SDCPN,
  net: SDCPN | Component,
  componentId: ID | null,
  libraries: ResolvedLibraries | undefined,
  pass: FusionCheckPass,
): FusionProblem[] =>
  (net.fusions ?? []).flatMap((fusion) =>
    checkFusion(sdcpn, net, fusion, componentId, libraries, pass),
  );

/** The problems with every fusion of the document, root first. */
export const checkFusions = (
  sdcpn: SDCPN,
  libraries?: ResolvedLibraries,
): FusionProblem[] => {
  const pass = fusionCheckPass(sdcpn, libraries);
  return [
    ...checkNetFusions(sdcpn, sdcpn, null, libraries, pass),
    ...(sdcpn.components ?? []).flatMap((component) =>
      checkNetFusions(sdcpn, component, component.id, libraries, pass),
    ),
  ];
};
