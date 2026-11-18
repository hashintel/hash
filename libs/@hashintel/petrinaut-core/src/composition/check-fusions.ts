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
import { checkPorts, type PortProblem } from "./check-ports";
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
  endpointUsage,
  portUsages,
  type PortNet,
  type PortUsage,
} from "./ports";

import type {
  ArcEndpoint,
  Color,
  Fusion,
  ID,
  InputArc,
  OutputArc,
  Place,
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
  /** The subnet the fusion belongs to; `null` for the root net. */
  subnetId: ID | null;
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
   * How a net's own transitions touch its ports. `netId` names the net: the
   * id of a subnet, `null` for the root net. Of two subnets with one id the
   * first asked about is read, as a search of the document finds it.
   */
  portUsagesOf: (netId: ID | null, net: PortNet) => (placeId: ID) => PortUsage;
};

export const fusionCheckPass = (): FusionCheckPass => {
  const usagesByNetId = new Map<ID | null, (placeId: ID) => PortUsage>();
  return {
    portUsagesOf: (netId, net) => {
      const known = usagesByNetId.get(netId);
      if (known) {
        return known;
      }
      const usageOf = portUsages(net);
      usagesByNetId.set(netId, usageOf);
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
 * component's own flow, for an instance port. For an anchor that is itself a
 * port of this net it is the net above, which does with the port the
 * opposite of what this net does.
 */
const farSideFlow = (
  net: CheckedNet,
  subnetId: ID | null,
  resolved: ResolvedFusionMember,
  pass: FusionCheckPass,
): TokenFlow => {
  if (resolved.kind === "port") {
    return ownPortFlow(resolved.place, () =>
      pass.portUsagesOf(resolved.subnet.id, resolved.subnet),
    );
  }
  if (!resolved.place.isPort) {
    return { produced: false, consumed: false };
  }
  const own = ownPortFlow(resolved.place, () =>
    pass.portUsagesOf(subnetId, net),
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
  subnetId: ID | null,
  member: ArcEndpoint,
  resolved: ResolvedFusionMember,
  pass: FusionCheckPass,
): Omit<MemberFacts, "label"> => {
  const { place } = resolved;
  const types = resolved.kind === "place" ? net.types : resolved.subnet.types;
  // A place runs equations of its own net.
  const equationNetId =
    resolved.kind === "place" ? subnetId : resolved.subnet.id;
  const equationIds = getRunningEquationIds(place);
  const outside = endpointUsage(net.transitions, member);
  const inside = farSideFlow(net, subnetId, resolved, pass);
  return {
    color: place.colorId
      ? types.find(({ id }) => id === place.colorId)
      : undefined,
    capacity: place.capacity ?? null,
    dynamicsKey:
      equationIds.length > 0
        ? JSON.stringify(
            equationIds.map((id) => equationKey(equationNetId, id)),
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
 * The problems with one fusion of `net`. A caller that checks many fusions
 * of one document hands each call the same `pass`.
 */
export const checkFusion = (
  sdcpn: Pick<SDCPN, "subnets">,
  net: CheckedNet,
  fusion: Fusion,
  subnetId: ID | null,
  pass: FusionCheckPass = fusionCheckPass(),
): FusionProblem[] => {
  const problems: FusionProblem[] = [];
  const fusionName = `the fusion ${fusion.name}`;
  const report = (code: FusionProblemCode, message: string) =>
    problems.push({
      subnetId,
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
  for (const [index, member] of fusion.members.entries()) {
    const resolved = resolveFusionMember(sdcpn, net, member);
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
      ...factsFor(net, subnetId, member, resolved, pass),
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
  if (!first) {
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
  net: SDCPN | Subnet,
  subnetId: ID | null,
  pass: FusionCheckPass,
): FusionProblem[] =>
  (net.fusions ?? []).flatMap((fusion) =>
    checkFusion(sdcpn, net, fusion, subnetId, pass),
  );

/** The problems with every fusion of the document, root first. */
export const checkFusions = (sdcpn: SDCPN): FusionProblem[] => {
  const pass = fusionCheckPass();
  return [
    ...checkNetFusions(sdcpn, sdcpn, null, pass),
    ...(sdcpn.subnets ?? []).flatMap((subnet) =>
      checkNetFusions(sdcpn, subnet, subnet.id, pass),
    ),
  ];
};

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
