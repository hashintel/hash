/**
 * Merges fused places once a composition is flattened: every member of a
 * fusion group becomes one place, the arcs that touched any member touch the
 * fused place, and the members' attributes are reconciled.
 */

import { colorsStructurallyEqual } from "./check-fusions";

import type {
  Color,
  ID,
  InputArc,
  OutputArc,
  Place,
  Transition,
} from "../types/sdcpn";

/** One fusion, as flat place ids. */
export type FusionGroup = {
  fusionId: ID;
  /** The flat ids of the fused places. */
  placeIds: ID[];
  /** The fusion's display name, given to the fused place when no anchor names it. */
  name: string | undefined;
};

type FlatNet = {
  places: Place[];
  transitions: Transition[];
  types: Color[];
};

/** The flat place that stands for every member of its group. */
export type FusionAliases = ReadonlyMap<ID, ID>;

const scopeDepth = (id: ID): number => id.split("::").length;

/**
 * Union-find over the groups' place ids. The representative of a set is its
 * outermost place, the one nearest the root net: it keeps its name, so a root
 * place fused with ports keeps the name metrics and scenarios refer to.
 */
const resolveSets = (groups: readonly FusionGroup[]): Map<ID, ID> => {
  const parent = new Map<ID, ID>();
  const find = (id: ID): ID => {
    let root = id;
    while (parent.get(root) !== undefined && parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    return root;
  };
  const union = (left: ID, right: ID) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) {
      return;
    }
    // The shallower id leads; the first seen wins a tie.
    const [leader, follower] =
      scopeDepth(rightRoot) < scopeDepth(leftRoot)
        ? [rightRoot, leftRoot]
        : [leftRoot, rightRoot];
    parent.set(follower, leader);
    parent.set(leader, leader);
  };
  for (const group of groups) {
    for (const id of group.placeIds) {
      parent.set(id, parent.get(id) ?? id);
    }
    const [first, ...rest] = group.placeIds;
    if (first !== undefined) {
      for (const id of rest) {
        union(first, id);
      }
    }
  }
  const aliases = new Map<ID, ID>();
  for (const id of parent.keys()) {
    const root = find(id);
    if (root !== id) {
      aliases.set(id, root);
    }
  }
  return aliases;
};

const mergeArcs = <Arc extends InputArc | OutputArc>(
  arcs: Arc[],
  aliases: FusionAliases,
): Arc[] => {
  const merged: Arc[] = [];
  for (const arc of arcs) {
    const placeId =
      arc.placeId === undefined
        ? undefined
        : (aliases.get(arc.placeId) ?? arc.placeId);
    const next = { ...arc, placeId } as Arc;
    const twin = merged.find(
      (candidate) =>
        candidate.placeId === next.placeId &&
        ("type" in candidate ? candidate.type : undefined) ===
          ("type" in next ? next.type : undefined),
    );
    if (twin) {
      // Two arcs of one kind between one place and one transition are one arc
      // whose weight is their sum, as the net theory has it.
      twin.weight += next.weight;
    } else {
      merged.push(next);
    }
  }
  return merged;
};

const reconcile = (
  net: FlatNet,
  representative: Place,
  member: Place,
  group: FusionGroup,
): void => {
  const fused = representative;
  const typeOf = (place: Place) =>
    place.colorId
      ? net.types.find(({ id }) => id === place.colorId)
      : undefined;
  if (!colorsStructurallyEqual(typeOf(representative), typeOf(member))) {
    throw new Error(
      `Fusion ${group.name ?? group.fusionId} joins places \`${representative.name}\` and \`${member.name}\` of different token types.`,
    );
  }
  if (member.capacity != null) {
    if (
      representative.capacity != null &&
      representative.capacity !== member.capacity
    ) {
      throw new Error(
        `Fusion ${group.name ?? group.fusionId} joins places \`${representative.name}\` and \`${member.name}\` of different capacities.`,
      );
    }
    fused.capacity = member.capacity;
  }
  if (member.dynamicsEnabled && member.differentialEquationId) {
    if (
      representative.dynamicsEnabled &&
      representative.differentialEquationId &&
      representative.differentialEquationId !== member.differentialEquationId
    ) {
      throw new Error(
        `Fusion ${group.name ?? group.fusionId} joins places \`${representative.name}\` and \`${member.name}\` that run different differential equations.`,
      );
    }
    fused.dynamicsEnabled = true;
    fused.differentialEquationId = member.differentialEquationId;
  }
  if (member.showAsInitialState) {
    fused.showAsInitialState = true;
  }
  if (representative.visualizerCode === undefined && member.visualizerCode) {
    fused.visualizerCode = member.visualizerCode;
  }
};

/**
 * Applies the fusion groups to a flat net in place: merged places leave
 * `net.places`, arcs move to the representative, and the representative takes
 * on what its members declare. Returns which flat ids now stand for which.
 */
export const applyFusions = (
  net: FlatNet,
  groups: readonly FusionGroup[],
): FusionAliases => {
  const aliases = resolveSets(groups);
  if (aliases.size === 0) {
    return aliases;
  }
  const placeById = new Map(net.places.map((place) => [place.id, place]));
  for (const group of groups) {
    for (const id of group.placeIds) {
      const representativeId = aliases.get(id);
      if (representativeId === undefined) {
        continue;
      }
      const representative = placeById.get(representativeId);
      const member = placeById.get(id);
      if (!representative || !member) {
        throw new Error(
          `Fusion ${group.name ?? group.fusionId} names a place that is not in the flattened net.`,
        );
      }
      reconcile(net, representative, member, group);
    }
  }
  // A port-only group has no anchor to name the fused place: the fusion's
  // own name, when it has one, names the representative instead.
  for (const group of groups) {
    const [first] = group.placeIds;
    if (group.name === undefined || first === undefined) {
      continue;
    }
    const representative = placeById.get(aliases.get(first) ?? first);
    if (representative && representative.id.includes("::")) {
      representative.name = group.name;
    }
  }
  const flat = net;
  flat.places = net.places.filter((place) => !aliases.has(place.id));
  for (const transition of net.transitions) {
    transition.inputArcs = mergeArcs(transition.inputArcs, aliases);
    transition.outputArcs = mergeArcs(transition.outputArcs, aliases);
  }
  return aliases;
};
