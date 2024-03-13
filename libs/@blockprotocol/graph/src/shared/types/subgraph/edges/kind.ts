const ONTOLOGY_EDGE_KINDS = [
  "INHERITS_FROM",
  "CONSTRAINS_VALUES_ON",
  "CONSTRAINS_PROPERTIES_ON",
  "CONSTRAINS_LINKS_ON",
  "CONSTRAINS_LINK_DESTINATIONS_ON",
] as const;

const KNOWLEDGE_GRAPH_EDGE_KIND = [
  "HAS_LEFT_ENTITY",
  "HAS_RIGHT_ENTITY",
] as const;

const SHARED_EDGE_KIND = ["IS_OF_TYPE"] as const;

export type OntologyEdgeKind = (typeof ONTOLOGY_EDGE_KINDS)[number];

export type KnowledgeGraphEdgeKind = (typeof KNOWLEDGE_GRAPH_EDGE_KIND)[number];

export type SharedEdgeKind = (typeof SHARED_EDGE_KIND)[number];

// -------------------------------- Type Guards --------------------------------

export const isOntologyEdgeKind = (kind: string): kind is OntologyEdgeKind => {
  return (ONTOLOGY_EDGE_KINDS as ReadonlyArray<string>).includes(kind);
};

export const isKnowledgeGraphEdgeKind = (
  kind: string,
): kind is KnowledgeGraphEdgeKind => {
  return (KNOWLEDGE_GRAPH_EDGE_KIND as ReadonlyArray<string>).includes(kind);
};

export const isSharedEdgeKind = (kind: string): kind is SharedEdgeKind => {
  return (SHARED_EDGE_KIND as ReadonlyArray<string>).includes(kind);
};
