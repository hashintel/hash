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

import {
  arcEndpointsEqual,
  arcMatchesEndpoint,
  placeArcEndpoint,
} from "../arc-endpoints";
import { getPlaceDynamicsEquationIds } from "../place-dynamics";
import {
  describeFusionMember,
  fusionDisplayName,
  fusionMemberIssues,
  resolveFusionMember,
  type FusionNet,
  type ResolvedFusionMember,
} from "./fusions";

import type {
  ArcEndpoint,
  Color,
  Fusion,
  ID,
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

/** How `transitions` touch the place `endpoint` names. */
const flowThrough = (
  transitions: readonly Transition[],
  endpoint: ArcEndpoint,
): TokenFlow => ({
  consumed: transitions.some(({ inputArcs }) =>
    inputArcs.some((arc) => arcMatchesEndpoint(arc, endpoint)),
  ),
  produced: transitions.some(({ outputArcs }) =>
    outputArcs.some((arc) => arcMatchesEndpoint(arc, endpoint)),
  ),
});

/**
 * How a net's own transitions touch one of its ports. A port no transition
 * touches passes tokens through for whoever is on the other side, so it
 * counts as both produced and consumed.
 */
const portFlow = (
  subnet: Pick<Subnet, "transitions">,
  placeId: ID,
): TokenFlow => {
  const flow = flowThrough(subnet.transitions, placeArcEndpoint(placeId));
  return flow.produced || flow.consumed ? flow : bothWays;
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
      ? portFlow(resolved.subnet, place.id)
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
