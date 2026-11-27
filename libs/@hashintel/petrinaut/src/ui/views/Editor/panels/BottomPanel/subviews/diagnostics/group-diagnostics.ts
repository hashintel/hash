import { netVisualizerId, parseDocumentUri } from "@hashintel/petrinaut-core";

import type { Diagnostic, SelectionItemType } from "@hashintel/petrinaut-core";

type NamedEntity = { id: string; name: string };

/** What the grouping reads of a net: the entities that own code. */
interface CodeOwners {
  transitions: readonly NamedEntity[];
  differentialEquations: readonly NamedEntity[];
  places: readonly NamedEntity[];
  /** The components of the document, each a net with a visualizer of its own. */
  components?: readonly NamedEntity[];
}

/**
 * What owns a code document: an item of the net, which can be selected, or a
 * net itself, the root net or a component, for the net's own visualizer.
 */
export type DiagnosticsEntityType = SelectionItemType | "net";

type CodeItemType = NonNullable<
  ReturnType<typeof parseDocumentUri>
>["itemType"];

/** The entity that owns each kind of code document, and the part of it the code is. */
const ownerOf = {
  "transition-lambda": {
    entityType: "transition",
    collection: "transitions",
    entityLabel: "Transition",
    part: "Lambda",
  },
  "transition-kernel": {
    entityType: "transition",
    collection: "transitions",
    entityLabel: "Transition",
    part: "Kernel",
  },
  "differential-equation": {
    entityType: "differentialEquation",
    collection: "differentialEquations",
    entityLabel: "Differential Equation",
    part: null,
  },
  "place-visualizer": {
    entityType: "place",
    collection: "places",
    entityLabel: "Place",
    part: "Visualizer",
  },
  "net-visualizer": {
    entityType: "net",
    collection: "components",
    entityLabel: "Net",
    part: "Visualizer",
  },
} as const satisfies Record<
  CodeItemType,
  {
    entityType: DiagnosticsEntityType;
    collection: keyof CodeOwners;
    entityLabel: string;
    part: string | null;
  }
>;

/** The name the root net goes by, which no entity of the document holds. */
const rootNetName = "Root";

export interface EntityDiagnostics {
  entityType: DiagnosticsEntityType;
  /** The entity's id. For a net, its `netVisualizerId`. */
  entityId: string;
  /** The kind of the entity and its name, or its id when the net does not hold it. */
  label: string;
  errorCount: number;
  /** One entry per code document of the entity that has diagnostics. */
  documents: {
    uri: string;
    /** Which code of the entity, where an entity can have more than one. */
    part: string | null;
    diagnostics: Diagnostic[];
  }[];
}

/**
 * The diagnostics of the net's code, listed under the entity each document
 * belongs to. Entities and documents keep the order they come in.
 */
export const groupDiagnosticsByEntity = (
  diagnosticsByUri: ReadonlyMap<string, Diagnostic[]>,
  definition: CodeOwners,
): EntityDiagnostics[] => {
  const groups = new Map<string, EntityDiagnostics>();

  for (const [uri, diagnostics] of diagnosticsByUri) {
    const parsed = parseDocumentUri(uri);
    if (!parsed) {
      continue;
    }
    const owner = ownerOf[parsed.itemType];
    const key = `${owner.entityType}:${parsed.itemId}`;

    let group = groups.get(key);
    if (!group) {
      const entity = definition[owner.collection]?.find(
        (item) => item.id === parsed.itemId,
      );
      const name =
        owner.entityType === "net" && parsed.itemId === netVisualizerId(null)
          ? rootNetName
          : (entity?.name ?? parsed.itemId);
      group = {
        entityType: owner.entityType,
        entityId: parsed.itemId,
        label: `${owner.entityLabel}: ${name}`,
        errorCount: 0,
        documents: [],
      };
      groups.set(key, group);
    }
    group.errorCount += diagnostics.length;
    group.documents.push({ uri, part: owner.part, diagnostics });
  }

  return [...groups.values()];
};
