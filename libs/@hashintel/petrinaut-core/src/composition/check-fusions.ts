/**
 * The checks on a net's fusions and ports: every member names a port or a
 * place that exists and belongs to this fusion alone, the members agree on
 * what the fused place is, no transition reaches the fused place twice, a
 * port is used the way it is declared, and a fused flow has somewhere to come
 * from and somewhere to go. Run on a document as the editor shows it, before
 * flattening, one fusion and one net at a time. Flattening throws on each of
 * the fusion errors too, apart from a member listed twice and a fusion with
 * fewer than two members, which merge nothing. It merges across nested
 * instances as well, and can refuse what no single fusion shows:
 * `place-fusion.mdx` lists those cases.
 */

import { arcEndpointsEqual, arcMatchesEndpoint } from "../arc-endpoints";
import { getPlaceDynamicsEquationIds } from "../place-dynamics";
import {
  describeFusionMember,
  fusionDisplayName,
  fusionMemberIssues,
  resolveFusionMember,
  type FusionNet,
  type ResolvedFusionMember,
} from "./fusions";
import {
  describePortDirection,
  effectivePortDirection,
  portUsage,
  portUsageMatchesDirection,
} from "./ports";

import type {
  ArcEndpoint,
  Color,
  Fusion,
  ID,
  Place,
  PortDirection,
  SDCPN,
  Subnet,
  Transition,
} from "../types/sdcpn";

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

export type FusionProblem = {
  /** The subnet the fusion belongs to; `null` for the root net. */
  subnetId: ID | null;
  fusionId: ID;
  code: FusionProblemCode;
  severity: ProblemSeverity;
  message: string;
};

/** A port whose subnet uses it against the direction it declares. */
export type PortProblem = {
  subnetId: ID;
  placeId: ID;
  severity: "warning";
  message: string;
};

/**
 * Whether two token types describe the same tokens: the same elements, in
 * the same order, under the same names and value types. The types' own names
 * and colours do not matter.
 */
export const colorsStructurallyEqual = (
  left: Color | undefined,
  right: Color | undefined,
): boolean => {
  if (left === undefined || right === undefined) {
    return left === right;
  }
  return (
    left.elements.length === right.elements.length &&
    left.elements.every(
      (element, index) =>
        element.name === right.elements[index]!.name &&
        element.type === right.elements[index]!.type,
    )
  );
};

type CheckedNet = FusionNet & Pick<SDCPN, "types" | "transitions">;

type TokenFlow = {
  /** Whether tokens can enter the fused place this way. */
  produced: boolean;
  /** Whether tokens can leave the fused place this way. */
  consumed: boolean;
};

const bothWays: TokenFlow = { produced: true, consumed: true };

/**
 * How `transitions` move tokens through the place `endpoint` names, and
 * whether any of their arcs touches it at all. A read or an inhibitor arc
 * looks at the place and takes nothing from it.
 */
const flowThrough = (
  transitions: readonly Transition[],
  endpoint: ArcEndpoint,
): TokenFlow & { touched: boolean } => {
  const inputs = transitions.flatMap(({ inputArcs }) =>
    inputArcs.filter((arc) => arcMatchesEndpoint(arc, endpoint)),
  );
  const produced = transitions.some(({ outputArcs }) =>
    outputArcs.some((arc) => arcMatchesEndpoint(arc, endpoint)),
  );
  return {
    consumed: inputs.some(({ type }) => type === "standard"),
    produced,
    touched: produced || inputs.length > 0,
  };
};

/**
 * How a component touches one of its ports: the direction it declares, else
 * the one its arcs give it. A port no transition touches passes tokens
 * through for the net outside to use, so it counts as both.
 */
const portFlow = (
  subnet: Pick<Subnet, "transitions">,
  place: Pick<Place, "id" | "portDirection">,
): TokenFlow => {
  // A declared direction is the component's promise. Without one the arcs
  // say what moves, and a read or an inhibitor arc takes nothing.
  if (place.portDirection !== undefined) {
    return {
      produced: place.portDirection !== "in",
      consumed: place.portDirection !== "out",
    };
  }
  const { touched, ...flow } = flowThrough(
    subnet.transitions,
    placeArcEndpoint(place.id),
  );
  return touched ? flow : bothWays;
};

type MemberFacts = TokenFlow & {
  label: string;
  color: Color | undefined;
  capacity: number | null;
  /**
   * The equations the member runs, in order. The simulator knows an equation
   * by its id alone, whichever net declares it.
   */
  dynamicsKey: string | null;
};

const factsFor = (
  net: CheckedNet,
  member: ArcEndpoint,
  resolved: ResolvedFusionMember,
  label: string,
): MemberFacts => {
  const { place } = resolved;
  const types = resolved.kind === "place" ? net.types : resolved.subnet.types;
  const equationIds = getPlaceDynamicsEquationIds(place);
  const outside = flowThrough(net.transitions, member);
  // What is on the far side of the member from this net's transitions: the
  // component's own, for an instance port; for an anchor that is itself a
  // port of this net, whatever the net above does with it.
  const inside =
    resolved.kind === "port"
      ? portFlow(resolved.subnet, place)
      : place.isPort
        ? bothWays
        : { produced: false, consumed: false };
  return {
    label,
    color: place.colorId
      ? types.find(({ id }) => id === place.colorId)
      : undefined,
    capacity: place.capacity ?? null,
    dynamicsKey:
      place.dynamicsEnabled && equationIds.length > 0
        ? JSON.stringify(equationIds)
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
  const reaches = (arc: Transition["inputArcs" | "outputArcs"][number]) =>
    fusion.members.some((member) => arcMatchesEndpoint(arc, member));
  return net.transitions.filter(({ inputArcs, outputArcs }) => {
    const inputKinds = inputArcs.filter(reaches).map(({ type }) => type);
    return (
      new Set(inputKinds).size < inputKinds.length ||
      outputArcs.filter(reaches).length > 1
    );
  });
};

/** The problems with one fusion of `net`. */
export const checkFusion = (
  sdcpn: Pick<SDCPN, "subnets">,
  net: CheckedNet,
  fusion: Fusion,
  subnetId: ID | null,
): FusionProblem[] => {
  const problems: FusionProblem[] = [];
  // Unnamed, a fusion goes by its anchor or first member: said as a fusion,
  // so a message is not read as one about that place.
  const fusionName = `the fusion ${fusionDisplayName(sdcpn, net, fusion)}`;
  const report = (
    code: FusionProblemCode,
    severity: ProblemSeverity,
    message: string,
  ) =>
    problems.push({ subnetId, fusionId: fusion.id, code, severity, message });

  if (fusion.members.length < 2) {
    report(
      "too-few-members",
      "error",
      `A fusion needs at least two members: ${fusionName} has fewer.`,
    );
  }

  const { duplicates, multipleAnchors } = fusionMemberIssues(fusion.members);
  const facts: MemberFacts[] = [];
  for (const [index, member] of fusion.members.entries()) {
    const label = describeFusionMember(sdcpn, net, member);
    if (duplicates.includes(index)) {
      report(
        "duplicate-member",
        "error",
        `${label} is listed twice in ${fusionName}.`,
      );
      continue;
    }
    const elsewhere = (net.fusions ?? []).some(
      (other) =>
        other.id !== fusion.id &&
        other.members.some((held) => arcEndpointsEqual(held, member)),
    );
    if (elsewhere) {
      report(
        "shared-member",
        "error",
        `${label} is in ${fusionName} and in another fusion of this net: a place or port belongs to one fusion.`,
      );
    }
    const resolved = resolveFusionMember(sdcpn, net, member);
    if (resolved === null) {
      report(
        "unresolved-member",
        "error",
        member.kind === "place"
          ? `A member of ${fusionName} is a place that no longer exists.`
          : `${label}, a member of ${fusionName}, is not a port of an instance in this net.`,
      );
      continue;
    }
    facts.push(factsFor(net, member, resolved, label));
  }
  if (multipleAnchors) {
    report(
      "multiple-anchors",
      "error",
      `More than one place of this net is in ${fusionName}; fuse ports into one place instead.`,
    );
  }
  for (const transition of transitionsReachingTwice(net, fusion)) {
    report(
      "repeated-arc",
      "error",
      `Transition ${transition.name} reaches ${fusionName} through two arcs of the same kind. Keep one of them.`,
    );
  }

  const [first, ...rest] = facts;
  if (!first) {
    return problems;
  }
  const mistyped = rest.find(
    (other) => !colorsStructurallyEqual(first.color, other.color),
  );
  if (mistyped) {
    report(
      "color-mismatch",
      "error",
      `${first.label} and ${mistyped.label} hold different token types, so they cannot be one place.`,
    );
  }
  const capacities = new Set(
    facts.flatMap(({ capacity }) => (capacity === null ? [] : [capacity])),
  );
  if (capacities.size > 1) {
    report(
      "capacity-mismatch",
      "error",
      `The places in ${fusionName} have different token capacities (${[...capacities].join(", ")}).`,
    );
  }
  const dynamics = new Set(
    facts.flatMap(({ dynamicsKey }) =>
      dynamicsKey === null ? [] : [dynamicsKey],
    ),
  );
  if (dynamics.size > 1) {
    report(
      "dynamics-conflict",
      "error",
      `The places in ${fusionName} run different differential equations; the members with dynamics must compose the same equations.`,
    );
  }
  if (!facts.some(({ produced }) => produced)) {
    report(
      "no-producer",
      "warning",
      `Nothing puts tokens into ${fusionName}: every member only consumes from it, so it holds only its initial marking.`,
    );
  }
  if (!facts.some(({ consumed }) => consumed)) {
    report(
      "no-consumer",
      "info",
      `Nothing takes tokens out of ${fusionName}: every member only produces into it, so it accumulates.`,
    );
  }
  return problems;
};

const checkNetFusions = (
  sdcpn: SDCPN,
  net: SDCPN | Subnet,
  subnetId: ID | null,
): FusionProblem[] =>
  (net.fusions ?? []).flatMap((fusion) =>
    checkFusion(sdcpn, net, fusion, subnetId),
  );

/** The problems with every fusion of the document, root first. */
export const checkFusions = (sdcpn: SDCPN): FusionProblem[] => [
  ...checkNetFusions(sdcpn, sdcpn, null),
  ...(sdcpn.subnets ?? []).flatMap((subnet) =>
    checkNetFusions(sdcpn, subnet, subnet.id),
  ),
];

/** The ports whose declared direction their subnet's arcs contradict. */
export const checkPorts = (sdcpn: SDCPN): PortProblem[] =>
  (sdcpn.subnets ?? []).flatMap((subnet) =>
    subnet.places.flatMap((place) => {
      if (!place.isPort || place.portDirection === undefined) {
        return [];
      }
      const usage = portUsage(subnet, place.id);
      if (portUsageMatchesDirection(usage, place.portDirection)) {
        return [];
      }
      const against =
        place.portDirection === "in" ? "produces into" : "consumes from";
      return [
        {
          subnetId: subnet.id,
          placeId: place.id,
          severity: "warning" as const,
          message: `Port ${place.name} of ${subnet.name} is declared ${describePortDirection(place.portDirection)}, but a transition of ${subnet.name} ${against} it.`,
        },
      ];
    }),
  );

export type CompositionProblem =
  | ({ kind: "fusion" } & FusionProblem)
  | ({ kind: "port" } & PortProblem);

/** Every problem with the document's composition: its fusions and its ports. */
export const checkComposition = (sdcpn: SDCPN): CompositionProblem[] => [
  ...checkFusions(sdcpn).map((problem): CompositionProblem => ({
    kind: "fusion",
    ...problem,
  })),
  ...checkPorts(sdcpn).map((problem): CompositionProblem => ({
    kind: "port",
    ...problem,
  })),
];
