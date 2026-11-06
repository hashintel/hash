/**
 * The checks on a net's fusions and ports: every member names a port or a
 * place that exists, the members agree on what the fused place is, a port is
 * used the way it is declared, and a fused flow has somewhere to come from
 * and somewhere to go. Run on a document as the editor shows it, before
 * flattening; the error-severity conditions make `applyFusions` throw too.
 */

import { getArcEndpoint } from "../arc-endpoints";
import {
  describeFusionMember,
  fusionDisplayName,
  fusionMemberKey,
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
  Color,
  Fusion,
  ID,
  Place,
  PortDirection,
  SDCPN,
  Subnet,
} from "../types/sdcpn";

export type FusionProblemCode =
  | "unresolved-member"
  | "duplicate-member"
  | "multiple-anchors"
  | "too-few-members"
  | "color-mismatch"
  | "capacity-mismatch"
  | "dynamics-conflict"
  | "no-producer"
  | "no-consumer";

export type ProblemSeverity = "error" | "warning" | "info";

export type FusionProblem = {
  /** The subnet the fusion belongs to; `null` for the root net. */
  subnetId: ID | null;
  fusionId: ID;
  /** The fusion's display name, for messages that name it. */
  fusionName: string;
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
 * Whether two token types describe the same tokens: the same dimensions, in
 * the same order, with the same value types. Names and colours do not matter.
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

type MemberFacts = TokenFlow & {
  member: ResolvedFusionMember;
  label: string;
  color: Color | undefined;
  capacity: number | null;
  /** The equation the member runs, keyed so two instances of one subnet agree. */
  dynamicsKey: string | null;
};

/** How the net's own transitions touch a member: its anchor's arcs, or the port arcs on an instance port. */
const outsideFlow = (
  net: CheckedNet,
  resolved: ResolvedFusionMember,
): TokenFlow => {
  let produced = false;
  let consumed = false;
  const matches = (endpoint: ReturnType<typeof getArcEndpoint>) =>
    resolved.kind === "place"
      ? endpoint.kind === "place" && endpoint.placeId === resolved.place.id
      : endpoint.kind === "componentPort" &&
        endpoint.componentInstanceId === resolved.instance.id &&
        endpoint.portPlaceId === resolved.place.id;
  for (const transition of net.transitions) {
    if (transition.inputArcs.some((arc) => matches(getArcEndpoint(arc)))) {
      consumed = true;
    }
    if (transition.outputArcs.some((arc) => matches(getArcEndpoint(arc)))) {
      produced = true;
    }
  }
  return { produced, consumed };
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
  const direction: PortDirection = effectivePortDirection(subnet, place);
  return {
    produced: direction !== "in",
    consumed: direction !== "out",
  };
};

const factsFor = (
  net: CheckedNet,
  resolved: ResolvedFusionMember,
  label: string,
): MemberFacts => {
  const place: Place = resolved.place;
  const types: Color[] =
    resolved.kind === "place" ? net.types : resolved.subnet.types;
  const scope: string =
    resolved.kind === "place" ? "" : `${resolved.subnet.id}::`;
  const outside = outsideFlow(net, resolved);
  const inside: TokenFlow =
    resolved.kind === "port"
      ? portFlow(resolved.subnet, place)
      : { produced: false, consumed: false };
  return {
    member: resolved,
    label,
    color: place.colorId
      ? types.find(({ id }) => id === place.colorId)
      : undefined,
    capacity: place.capacity ?? null,
    dynamicsKey:
      place.dynamicsEnabled && place.differentialEquationId
        ? `${scope}${place.differentialEquationId}`
        : null,
    produced: outside.produced || inside.produced,
    consumed: outside.consumed || inside.consumed,
  };
};

/** The problems with one fusion of `net`. */
export const checkFusion = (
  sdcpn: Pick<SDCPN, "types" | "subnets">,
  net: CheckedNet,
  fusion: Fusion,
  subnetId: ID | null,
): FusionProblem[] => {
  const problems: FusionProblem[] = [];
  const fusionName = fusionDisplayName(sdcpn, net, fusion);
  const report = (
    code: FusionProblemCode,
    severity: ProblemSeverity,
    message: string,
  ) =>
    problems.push({
      subnetId,
      fusionId: fusion.id,
      fusionName,
      code,
      severity,
      message,
    });

  if (fusion.members.length < 2) {
    report(
      "too-few-members",
      "error",
      `Fusion ${fusionName} needs at least two members.`,
    );
  }

  const seen = new Set<string>();
  const facts: MemberFacts[] = [];
  let anchors = 0;
  for (const member of fusion.members) {
    const key = fusionMemberKey(member);
    const label = describeFusionMember(sdcpn, net, member);
    if (seen.has(key)) {
      report(
        "duplicate-member",
        "error",
        `${label} is listed twice in ${fusionName}.`,
      );
      continue;
    }
    seen.add(key);
    if (member.kind === "place") {
      anchors += 1;
    }
    const resolved = resolveFusionMember(sdcpn, net, member);
    if (resolved === null) {
      report(
        "unresolved-member",
        "error",
        member.kind === "place"
          ? `${fusionName} names a place that no longer exists.`
          : `${fusionName} names ${label}, which is not a port of an instance in this net.`,
      );
      continue;
    }
    facts.push(factsFor(net, resolved, label));
  }
  if (anchors > 1) {
    report(
      "multiple-anchors",
      "error",
      `${fusionName} holds more than one place of this net; fuse ports into one place instead.`,
    );
  }

  const [first, ...rest] = facts;
  if (!first) {
    return problems;
  }
  for (const other of rest) {
    if (!colorsStructurallyEqual(first.color, other.color)) {
      report(
        "color-mismatch",
        "error",
        `${first.label} and ${other.label} hold different token types, so they cannot be one place.`,
      );
    }
  }
  const capacities = new Set(
    facts.flatMap(({ capacity }) => (capacity === null ? [] : [capacity])),
  );
  if (capacities.size > 1) {
    report(
      "capacity-mismatch",
      "error",
      `${fusionName} fuses places with different token capacities (${[...capacities].join(", ")}).`,
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
      `${fusionName} fuses places that run different differential equations; at most one equation can drive the fused place.`,
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
