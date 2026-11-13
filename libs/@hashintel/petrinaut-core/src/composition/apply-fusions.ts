/**
 * Merges fused places once a composition is flattened: every member of a
 * fusion group becomes one place, the arcs that touched any member touch the
 * fused place, and the members' attributes are reconciled.
 */

import { getPlaceDynamicsEquationIds } from "../place-dynamics";
import { scopeDepth, sourceItemId } from "../simulation/engine/scoped-id";
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
  /** Names the fusion in error messages. */
  label: string;
  /** The flat ids of the fused places. */
  placeIds: ID[];
  /** The name the fused place takes: the fusion's own, where no place of its net anchors it. */
  name?: string;
};

type FlatNet = {
  places: Place[];
  transitions: Transition[];
  types: Color[];
};

export type AppliedFusions = {
  /** The flat place that stands for each flat place merged away. */
  aliases: ReadonlyMap<ID, ID>;
  /**
   * For each fused place that took its dynamics from a merged place, that
   * merged place: the parameter values its equations read are that place's.
   */
  dynamicsDonors: ReadonlyMap<ID, ID>;
};

/**
 * Union-find over the groups' place ids. The representative of a set is its
 * outermost place, the one nearest the root net: it keeps its name, so a root
 * place fused with ports keeps the name metrics and scenarios refer to.
 */
const resolveSets = (groups: readonly FusionGroup[]): Map<ID, ID> => {
  const parent = new Map<ID, ID>();
  const find = (id: ID): ID => {
    let root = id;
    for (
      let next = parent.get(root);
      next !== undefined && next !== root;
      next = parent.get(root)
    ) {
      root = next;
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

const runningEquations = (place: Place): ID[] =>
  place.dynamicsEnabled ? getPlaceDynamicsEquationIds(place) : [];

/** Whether two places run the same equations: each instance of a component scopes the same ones under its own id. */
const sameEquations = (left: ID[], right: ID[]): boolean =>
  left.length === right.length &&
  left.every(
    (equationId, index) =>
      sourceItemId(equationId) === sourceItemId(right[index] ?? ""),
  );

/**
 * Gives `fused` what `member` declares and throws where the two disagree.
 * Returns whether `fused` took on `member`'s dynamics.
 */
const reconcile = (
  net: FlatNet,
  fused: Place,
  member: Place,
  label: string,
): boolean => {
  const target = fused;
  const disagree = (on: string) =>
    new Error(
      `Fusion ${label} joins places \`${fused.name}\` and \`${member.name}\` ${on}.`,
    );
  const typeOf = (place: Place) =>
    place.colorId
      ? net.types.find(({ id }) => id === place.colorId)
      : undefined;
  if (!colorsStructurallyEqual(typeOf(fused), typeOf(member))) {
    throw disagree("of different token types");
  }
  if (member.capacity != null) {
    if (fused.capacity != null && fused.capacity !== member.capacity) {
      throw disagree("of different capacities");
    }
    target.capacity = member.capacity;
  }
  if (member.showAsInitialState) {
    target.showAsInitialState = true;
  }
  if (fused.visualizerCode === undefined && member.visualizerCode) {
    target.visualizerCode = member.visualizerCode;
  }
  const memberEquations = runningEquations(member);
  if (memberEquations.length === 0) {
    return false;
  }
  const fusedEquations = runningEquations(fused);
  if (fusedEquations.length > 0) {
    if (!sameEquations(fusedEquations, memberEquations)) {
      throw disagree("that run different differential equations");
    }
    return false;
  }
  target.dynamicsEnabled = true;
  target.dynamics = memberEquations.map((differentialEquationId) => ({
    differentialEquationId,
  }));
  return true;
};

/**
 * A transition's arcs, off the places merged away. Its code addresses its
 * arcs by position, so two arcs of one kind that now reach the same fused
 * place cannot be folded into one: that is an error.
 */
const redirectArcs = <Arc extends InputArc | OutputArc>(
  transition: Transition,
  arcs: Arc[],
  aliases: ReadonlyMap<ID, ID>,
): Arc[] => {
  // For each kind of arc and place an arc already reaches: whether a merge
  // sent it there.
  const reached = new Map<string, boolean>();
  return arcs.map((arc) => {
    const fusedId =
      arc.placeId === undefined ? undefined : aliases.get(arc.placeId);
    const placeId = fusedId ?? arc.placeId;
    const key = `${"type" in arc ? arc.type : "output"}:${placeId}`;
    const merged = fusedId !== undefined;
    const earlier = reached.get(key);
    if (earlier !== undefined && (earlier || merged)) {
      throw new Error(
        `Transition \`${transition.name}\` reaches one fused place through two arcs of the same kind. Keep one of them.`,
      );
    }
    reached.set(key, merged);
    return { ...arc, placeId };
  });
};

/**
 * Applies the fusion groups to a flat net in place: merged places leave
 * `net.places`, arcs move to the fused place, and the fused place takes on
 * what its members declare.
 */
export const applyFusions = (
  net: FlatNet,
  groups: readonly FusionGroup[],
): AppliedFusions => {
  const aliases = resolveSets(groups);
  const dynamicsDonors = new Map<ID, ID>();
  if (aliases.size === 0) {
    return { aliases, dynamicsDonors };
  }
  const placeById = new Map(net.places.map((place) => [place.id, place]));
  for (const group of groups) {
    for (const id of group.placeIds) {
      const fusedId = aliases.get(id);
      if (fusedId === undefined) {
        continue;
      }
      const fused = placeById.get(fusedId);
      const member = placeById.get(id);
      if (!fused || !member) {
        throw new Error(
          `Fusion ${group.label} names a place that is not in the flattened net.`,
        );
      }
      if (reconcile(net, fused, member, group.label)) {
        dynamicsDonors.set(fusedId, id);
      }
    }
  }
  // A fusion with no anchor names the fused place itself, when the fused
  // place is one of its own members and not a place fused in from outside.
  for (const { name, placeIds } of groups) {
    const [first] = placeIds;
    const fused =
      first === undefined
        ? undefined
        : placeById.get(aliases.get(first) ?? first);
    if (name !== undefined && fused && placeIds.includes(fused.id)) {
      fused.name = name;
    }
  }
  const flat = net;
  flat.places = net.places.filter((place) => !aliases.has(place.id));
  for (const transition of net.transitions) {
    transition.inputArcs = redirectArcs(
      transition,
      transition.inputArcs,
      aliases,
    );
    transition.outputArcs = redirectArcs(
      transition,
      transition.outputArcs,
      aliases,
    );
  }
  return { aliases, dynamicsDonors };
};
