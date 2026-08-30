/**
 * Pure projections of an SDCPN into the notebook view's data: the flat,
 * document-ordered list of cells, and the dependency graph the gutter lines
 * and graph explorer are drawn from.
 */

import type { ActiveNetDefinition } from "../../../react/state/active-net-context";
import type {
  Color,
  DifferentialEquation,
  InputArc,
  OutputArc,
  Parameter,
  Place,
  SelectionItem,
  Transition,
} from "@hashintel/petrinaut-core";

export type NotebookCell =
  | { kind: "place"; id: string; place: Place }
  | { kind: "transition"; id: string; transition: Transition }
  | { kind: "type"; id: string; color: Color }
  | { kind: "differentialEquation"; id: string; equation: DifferentialEquation }
  | { kind: "parameter"; id: string; parameter: Parameter };

export type NotebookCellKind = NotebookCell["kind"];

/**
 * Cells in document order — the order entities are stored in the net
 * definition.
 */
export function buildNotebookCells(net: ActiveNetDefinition): NotebookCell[] {
  return [
    ...net.places.map(
      (place): NotebookCell => ({ kind: "place", id: place.id, place }),
    ),
    ...net.transitions.map(
      (transition): NotebookCell => ({
        kind: "transition",
        id: transition.id,
        transition,
      }),
    ),
    ...net.types.map(
      (color): NotebookCell => ({ kind: "type", id: color.id, color }),
    ),
    ...net.differentialEquations.map(
      (equation): NotebookCell => ({
        kind: "differentialEquation",
        id: equation.id,
        equation,
      }),
    ),
    ...net.parameters.map(
      (parameter): NotebookCell => ({
        kind: "parameter",
        id: parameter.id,
        parameter,
      }),
    ),
  ];
}

export function cellToSelectionItem(cell: NotebookCell): SelectionItem {
  return { type: cell.kind, id: cell.id };
}

export function cellName(cell: NotebookCell): string {
  switch (cell.kind) {
    case "place":
      return cell.place.name || cell.id;
    case "transition":
      return cell.transition.name || cell.id;
    case "type":
      return cell.color.name || cell.id;
    case "differentialEquation":
      return cell.equation.name || cell.id;
    case "parameter":
      return cell.parameter.name || cell.id;
  }
}

/**
 * Case-insensitive fuzzy subsequence match of `query` against `name`
 * (whitespace in the query is ignored). Returns the indices of the matched
 * characters in `name`, or `null` when the query doesn't match.
 */
export function fuzzyMatchName(query: string, name: string): number[] | null {
  const indices: number[] = [];
  let searchFrom = 0;
  // Lowercase one character at a time, on both sides: lowercasing a whole
  // string can change its length (e.g. "İ" → "i̇"), which would split one
  // typed query character into two match steps and leave the returned
  // indices misaligned with the original name.
  for (const char of query) {
    if (char.trim() === "") {
      continue;
    }
    const needle = char.toLowerCase();
    let index = -1;
    for (let at = searchFrom; at < name.length; at += 1) {
      if (
        name
          .slice(at, at + char.length)
          .toLowerCase()
          .startsWith(needle)
      ) {
        index = at;
        break;
      }
    }
    if (index === -1) {
      return null;
    }
    indices.push(index);
    searchFrom = index + 1;
  }
  return indices;
}

/**
 * Resolve an arc to the plain place it connects to, or `null` for component
 * port endpoints.
 */
export function arcPlaceId(arc: InputArc | OutputArc): string | null {
  if (arc.endpoint) {
    return arc.endpoint.kind === "place" ? arc.endpoint.placeId : null;
  }
  return arc.placeId ?? null;
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids)];
}

export function transitionInputPlaceIds(transition: Transition): string[] {
  return dedupe(
    transition.inputArcs
      .map(arcPlaceId)
      .filter((id): id is string => id !== null),
  );
}

export function transitionOutputPlaceIds(transition: Transition): string[] {
  return dedupe(
    transition.outputArcs
      .map(arcPlaceId)
      .filter((id): id is string => id !== null),
  );
}

// Keyed weakly by the net object: edits produce a new definition object, so
// each cache entry stays valid for as long as its net is reachable. Without
// this, every arc of every rendered summary rescans the place array.
const placeNamesByNet = new WeakMap<ActiveNetDefinition, Map<string, string>>();

export function placeName(net: ActiveNetDefinition, placeId: string): string {
  let names = placeNamesByNet.get(net);
  if (names === undefined) {
    names = new Map(
      net.places.map((place) => [place.id, place.name || place.id]),
    );
    placeNamesByNet.set(net, names);
  }
  return names.get(placeId) ?? placeId;
}

/** A cell referenced as one end of a dependency edge. */
export type NodeRef = {
  type: NotebookCellKind;
  id: string;
  name: string;
};

/**
 * What a cell depends on and what depends on it. Derived from a single edge
 * list, so the two directions are always consistent with each other.
 */
export type CellConnections = {
  upstream: NodeRef[];
  downstream: NodeRef[];
};

export const noConnections = (): CellConnections => ({
  upstream: [],
  downstream: [],
});

/** `dependent` needs `dependency` in order to be understood. */
type DependencyEdge = { dependency: NodeRef; dependent: NodeRef };

function isIdentifierChar(char: string | undefined): boolean {
  if (char === undefined) {
    return false;
  }
  return (
    (char >= "a" && char <= "z") ||
    (char >= "A" && char <= "Z") ||
    (char >= "0" && char <= "9") ||
    char === "_" ||
    char === "$"
  );
}

/**
 * Best-effort textual check for a parameter reference in user code: the
 * variable name must appear with no identifier character on either side, so
 * `rate` matches in `rate * 2` but not in `growth_rate` or `$rate`.
 */
function codeReferences(
  code: string | undefined,
  variableName: string,
): boolean {
  if (!code || !variableName) {
    return false;
  }
  for (
    let at = code.indexOf(variableName);
    at !== -1;
    at = code.indexOf(variableName, at + 1)
  ) {
    if (
      !isIdentifierChar(code[at - 1]) &&
      !isIdentifierChar(code[at + variableName.length])
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Every dependency relationship the notebook knows how to draw:
 *
 * - a transition depends on its input places, and its output places depend
 *   on it (so token flow reads left-to-right through the gutters);
 * - a place depends on its token type, its differential equation, and any
 *   parameter its visualizer references;
 * - a differential equation depends on its token type and the parameters its
 *   code references;
 * - a transition depends on the parameters its lambda or kernel references.
 *
 * Types and parameters are pure declarations, so they never have upstream
 * edges of their own.
 */
function buildDependencyEdges(net: ActiveNetDefinition): DependencyEdge[] {
  const placeRefs = new Map<string, NodeRef>(
    net.places.map((place) => [
      place.id,
      { type: "place", id: place.id, name: place.name || place.id },
    ]),
  );
  const typeRefs = new Map<string, NodeRef>(
    net.types.map((color) => [
      color.id,
      { type: "type", id: color.id, name: color.name || color.id },
    ]),
  );
  const equationRefs = new Map<string, NodeRef>(
    net.differentialEquations.map((equation) => [
      equation.id,
      {
        type: "differentialEquation",
        id: equation.id,
        name: equation.name || equation.id,
      },
    ]),
  );

  const edges: DependencyEdge[] = [];
  const seen = new Set<string>();

  const add = (
    dependency: NodeRef | undefined,
    dependent: NodeRef | undefined,
  ) => {
    if (
      dependency === undefined ||
      dependent === undefined ||
      dependency.id === dependent.id
    ) {
      return;
    }
    // Direction matters: a place that is both input and output of the same
    // transition legitimately produces one edge each way.
    const key = `${dependency.id} ${dependent.id}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    edges.push({ dependency, dependent });
  };

  const parameterRefs = net.parameters.map((parameter) => ({
    parameter,
    ref: {
      type: "parameter" as const,
      id: parameter.id,
      name: parameter.name || parameter.id,
    },
  }));

  const addParameterEdges = (
    dependent: NodeRef,
    ...code: (string | undefined)[]
  ) => {
    for (const { parameter, ref } of parameterRefs) {
      if (
        code.some((snippet) => codeReferences(snippet, parameter.variableName))
      ) {
        add(ref, dependent);
      }
    }
  };

  for (const place of net.places) {
    const dependent = placeRefs.get(place.id)!;
    if (place.colorId !== null) {
      add(typeRefs.get(place.colorId), dependent);
    }
    if (place.differentialEquationId !== null) {
      add(equationRefs.get(place.differentialEquationId), dependent);
    }
    addParameterEdges(dependent, place.visualizerCode);
  }

  for (const transition of net.transitions) {
    const transitionRef: NodeRef = {
      type: "transition",
      id: transition.id,
      name: transition.name || transition.id,
    };
    for (const placeId of transitionInputPlaceIds(transition)) {
      add(placeRefs.get(placeId), transitionRef);
    }
    for (const placeId of transitionOutputPlaceIds(transition)) {
      add(transitionRef, placeRefs.get(placeId));
    }
    addParameterEdges(
      transitionRef,
      transition.lambdaCode,
      transition.transitionKernelCode,
    );
  }

  for (const equation of net.differentialEquations) {
    const dependent = equationRefs.get(equation.id)!;
    if (equation.colorId !== null) {
      add(typeRefs.get(equation.colorId), dependent);
    }
    addParameterEdges(dependent, equation.code);
  }

  return edges;
}

/**
 * Upstream/downstream connections for every cell in the net, keyed by cell
 * id. Built once per net so the gutter lines, the explorer and keyboard
 * navigation all read the same graph.
 */
export function buildConnectionIndex(
  net: ActiveNetDefinition,
): Map<string, CellConnections> {
  const index = new Map<string, CellConnections>();

  const entryFor = (id: string): CellConnections => {
    const existing = index.get(id);
    if (existing !== undefined) {
      return existing;
    }
    const created = noConnections();
    index.set(id, created);
    return created;
  };

  for (const { dependency, dependent } of buildDependencyEdges(net)) {
    entryFor(dependent.id).upstream.push(dependency);
    entryFor(dependency.id).downstream.push(dependent);
  }

  return index;
}

/**
 * The selected node's immediate neighbourhood, restricted to the net's own
 * nodes (places and transitions) and split by direction.
 *
 * A neighbour that is reachable both ways — a place that is an input *and* an
 * output of the same transition, for instance — is a cycle through the centre
 * and lands in `bidirectional` rather than being drawn twice.
 */
export type NodeNeighbourhood = {
  dependencies: NodeRef[];
  dependents: NodeRef[];
  bidirectional: NodeRef[];
};

const isNetNode = (ref: NodeRef): boolean =>
  ref.type === "place" || ref.type === "transition";

/** Deduplicate refs by id, keeping first occurrence order. */
const uniqueRefs = (refs: NodeRef[]): NodeRef[] => {
  const byId = new Map<string, NodeRef>();
  for (const ref of refs) {
    if (!byId.has(ref.id)) {
      byId.set(ref.id, ref);
    }
  }
  return [...byId.values()];
};

export function buildNodeNeighbourhood(
  connections: CellConnections,
): NodeNeighbourhood {
  const upstream = uniqueRefs(connections.upstream.filter(isNetNode));
  const downstream = uniqueRefs(connections.downstream.filter(isNetNode));

  const upstreamIds = new Set(upstream.map(({ id }) => id));
  const downstreamIds = new Set(downstream.map(({ id }) => id));

  return {
    dependencies: upstream.filter(({ id }) => !downstreamIds.has(id)),
    dependents: downstream.filter(({ id }) => !upstreamIds.has(id)),
    bidirectional: upstream.filter(({ id }) => downstreamIds.has(id)),
  };
}

export type NetGraphNodeKind = "place" | "transition";

export type NetGraphNode = {
  id: string;
  name: string;
  kind: NetGraphNodeKind;
};

/** A directed arc between two net nodes, in token-flow direction. */
export type NetGraphEdge = { from: string; to: string };

export type NetGraph = { nodes: NetGraphNode[]; edges: NetGraphEdge[] };

/**
 * The whole net as a directed graph of places and transitions: an input arc
 * becomes place → transition, an output arc transition → place. Arcs to
 * component ports, and arcs naming a place that no longer exists, are
 * skipped. Only places and transitions appear — this graph describes token
 * flow.
 */
export function buildNetGraph(net: ActiveNetDefinition): NetGraph {
  const nodes: NetGraphNode[] = [
    ...net.places.map(
      (place): NetGraphNode => ({
        id: place.id,
        name: place.name || place.id,
        kind: "place",
      }),
    ),
    ...net.transitions.map(
      (transition): NetGraphNode => ({
        id: transition.id,
        name: transition.name || transition.id,
        kind: "transition",
      }),
    ),
  ];

  const placeIds = new Set(net.places.map(({ id }) => id));
  const edges: NetGraphEdge[] = [];
  const seen = new Set<string>();

  const add = (from: string, to: string) => {
    const key = `${from} ${to}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    edges.push({ from, to });
  };

  for (const transition of net.transitions) {
    for (const placeId of transitionInputPlaceIds(transition)) {
      if (placeIds.has(placeId)) {
        add(placeId, transition.id);
      }
    }
    for (const placeId of transitionOutputPlaceIds(transition)) {
      if (placeIds.has(placeId)) {
        add(transition.id, placeId);
      }
    }
  }

  return { nodes, edges };
}

/**
 * How much depends on a cell: `direct` counts its immediate dependents,
 * `transitive` counts everything reachable downstream from it (itself
 * excluded, so a cell inside a cycle doesn't count itself).
 */
export type DependentCount = { direct: number; transitive: number };

/**
 * Dependent counts for every cell in the index. Cycles are handled by visiting
 * each node at most once per traversal, so a loop contributes its members
 * rather than looping forever.
 */
export function buildDependentCounts(
  index: Map<string, CellConnections>,
): Map<string, DependentCount> {
  const counts = new Map<string, DependentCount>();

  for (const [id, connections] of index) {
    const reached = new Set<string>();
    const queue = connections.downstream.map((ref) => ref.id);

    for (let head = 0; head < queue.length; head++) {
      const next = queue[head]!;
      if (next === id || reached.has(next)) {
        continue;
      }
      reached.add(next);
      for (const ref of index.get(next)?.downstream ?? []) {
        queue.push(ref.id);
      }
    }

    counts.set(id, {
      direct: connections.downstream.length,
      transitive: reached.size,
    });
  }

  return counts;
}
