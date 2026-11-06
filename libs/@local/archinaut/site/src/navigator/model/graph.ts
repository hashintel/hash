/**
 * Indexes over the map model: lookups by id, the layer tree, edges by
 * endpoint, and which interfaces each node takes part in. Built once.
 */

import type { ExternalNode, InterfaceNode } from "../../../../src/model";
import type { MapEdge, MapLayer, MapModel } from "./map-data";

export type GraphNode = MapLayer | InterfaceNode | ExternalNode;

export interface GraphIndex {
  model: MapModel;
  nodes: Map<string, GraphNode>;
  layers: Map<string, MapLayer>;
  interfaces: Map<string, InterfaceNode>;
  /** Parent layer id → children, in id order. */
  children: Map<string, MapLayer[]>;
  roots: MapLayer[];
  edgesFrom: Map<string, MapEdge[]>;
  edgesTo: Map<string, MapEdge[]>;
  /** Node id → interfaces it participates in. */
  interfacesOf: Map<string, InterfaceNode[]>;
}

const append = <K, V>(map: Map<K, V[]>, key: K, value: V): void => {
  const list = map.get(key);
  if (list === undefined) {
    map.set(key, [value]);
  } else {
    list.push(value);
  }
};

export const isInterfaceId = (id: string): boolean => id.startsWith("iface:");

export const isExternalId = (id: string): boolean => id.startsWith("external:");

export const isLayer = (node: GraphNode): node is MapLayer =>
  !isInterfaceId(node.id) && !isExternalId(node.id);

export const isInterface = (node: GraphNode): node is InterfaceNode =>
  isInterfaceId(node.id);

export const indexGraph = (model: MapModel): GraphIndex => {
  const layers = new Map(model.layers.map((layer) => [layer.id, layer]));
  const interfaces = new Map(model.interfaces.map((node) => [node.id, node]));
  const nodes = new Map<string, GraphNode>();
  for (const node of [
    ...model.layers,
    ...model.interfaces,
    ...model.externals,
  ]) {
    nodes.set(node.id, node);
  }

  const children = new Map<string, MapLayer[]>();
  const roots: MapLayer[] = [];
  for (const layer of model.layers) {
    if (layer.parent === null) {
      roots.push(layer);
    } else {
      append(children, layer.parent, layer);
    }
  }

  const edgesFrom = new Map<string, MapEdge[]>();
  const edgesTo = new Map<string, MapEdge[]>();
  for (const edge of model.edges) {
    append(edgesFrom, edge.from, edge);
    append(edgesTo, edge.to, edge);
  }

  const interfacesOf = new Map<string, InterfaceNode[]>();
  for (const node of model.interfaces) {
    for (const participant of node.participants) {
      append(interfacesOf, participant.node, node);
    }
  }

  return {
    model,
    nodes,
    layers,
    interfaces,
    children,
    roots,
    edgesFrom,
    edgesTo,
    interfacesOf,
  };
};

/** Ancestor layer ids of a dotted id, nearest first. */
export const ancestorIds = (id: string): string[] => {
  const parts = id.split(".");
  const ancestors: string[] = [];
  for (let length = parts.length - 1; length >= 1; length -= 1) {
    ancestors.push(parts.slice(0, length).join("."));
  }
  return ancestors;
};

export const rootOf = (id: string): string => id.split(".")[0] ?? id;

/** The short label a box shows: the last id segment for layers, the name otherwise. */
export const shortName = (node: GraphNode): string =>
  isLayer(node) ? (node.id.split(".").pop() ?? node.id) : node.name;

export const displayName = (node: GraphNode): string =>
  isLayer(node) ? node.id : node.name;

/** The one line that says what a node is for. */
export const summaryOf = (node: GraphNode): string =>
  isLayer(node) ? node.role : node.summary;

/** The top-level layer whose box holds a node on the map, or null when none does. */
export const regionOf = (index: GraphIndex, id: string): string | null => {
  const node = index.nodes.get(id);
  if (node === undefined) {
    return null;
  }
  if (isLayer(node)) {
    return rootOf(node.id);
  }
  return isInterface(node) ? rootOf(node.definedBy) : null;
};
