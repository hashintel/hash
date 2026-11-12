import { componentsFromVersionedUrl } from "@blockprotocol/type-system";
import {
  identifierTypeTitles,
  measurementTypeTitles,
} from "@hashintel/design-system";
import { buildDataTypeTreesForSelector } from "@local/hash-isomorphic-utils/data-types";
import { blockProtocolDataTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import { primitiveRootTypes } from "../shared/primitive-root-types";

import type {
  BaseUrl,
  DataType,
  DataTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { IconName } from "@hashintel/ds-components";

export type DataTypeTreeNode = ReturnType<
  typeof buildDataTypeTreesForSelector
>[number];

export type DataTypeTree = {
  roots: DataTypeTreeNode[];
  nodeById: Map<VersionedUrl, DataTypeTreeNode>;
  selectableCount: number;
};

const indexTreeNodes = (
  roots: DataTypeTreeNode[],
): Map<VersionedUrl, DataTypeTreeNode> => {
  const nodeById = new Map<VersionedUrl, DataTypeTreeNode>();
  const collect = (node: DataTypeTreeNode) => {
    if (!nodeById.has(node.$id)) {
      nodeById.set(node.$id, node);
    }
    for (const child of node.children) {
      collect(child);
    }
  };
  for (const root of roots) {
    collect(root);
  }
  return nodeById;
};

export const buildDataTypeTree = ({
  latestDataTypes,
  excludedBaseUrl,
}: {
  latestDataTypes: Record<BaseUrl, DataTypeWithMetadata>;
  excludedBaseUrl?: BaseUrl;
}): DataTypeTree => {
  const pool: Record<VersionedUrl, DataType> = {};
  const targets: DataType[] = [];

  for (const dataType of Object.values(latestDataTypes)) {
    // The excluded (edited) type stays in the pool so types extending it
    // still attach to the tree through it — its own node is hoisted out of
    // the built forest below
    pool[dataType.schema.$id] = dataType.schema;

    if (
      dataType.schema.allOf?.some(
        ({ $ref }) => $ref === blockProtocolDataTypes.value.dataTypeId,
      )
    ) {
      targets.push(dataType.schema);
    }
  }

  const builtRoots = buildDataTypeTreesForSelector({
    targetDataTypes: targets,
    dataTypePoolById: pool,
  });

  // The edited type must not be pickable, but its descendants must stay
  // reachable: replace its node with its children wherever it appears
  const hoistExcluded = (nodes: DataTypeTreeNode[]): DataTypeTreeNode[] =>
    nodes.flatMap((node) =>
      node.baseUrl === excludedBaseUrl
        ? hoistExcluded(node.children)
        : [{ ...node, children: hoistExcluded(node.children) }],
    );

  // Null isn't a pickable value type — a nullable property models absence
  // through the property, not a data type
  const roots = (
    excludedBaseUrl ? hoistExcluded(builtRoots) : builtRoots
  ).filter((root) => root.type !== "null");

  // The primitive types are served on demand by the type fetcher, so until
  // something references one the graph may have no copy of it to put in the
  // tree — offer the statically-known identity instead
  for (const rootType of primitiveRootTypes) {
    if (
      rootType.type === "null" ||
      rootType.baseUrl === excludedBaseUrl ||
      roots.some((root) => root.baseUrl === rootType.baseUrl)
    ) {
      continue;
    }

    roots.push({
      $id: rootType.dataTypeId,
      abstract: false,
      baseUrl: rootType.baseUrl,
      children: [],
      description: rootType.description,
      directParents: [blockProtocolDataTypes.value.dataTypeId],
      label: {},
      title: rootType.title,
      type: rootType.type,
      version: componentsFromVersionedUrl(rootType.dataTypeId).version,
    });
  }

  const rootRank = (title: string) => {
    const index = ["Text", "Number", "Boolean", "List", "Object"].indexOf(
      title,
    );
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  roots.sort(
    (a, b) =>
      rootRank(a.title) - rootRank(b.title) || a.title.localeCompare(b.title),
  );

  const nodeById = indexTreeNodes(roots);

  return { roots, nodeById, selectableCount: nodeById.size };
};

/**
 * The tree scoped to one root's subtree: its children become the top-level
 * options, so a picker locked to that root's value category offers only
 * in-category types. Falls back to the full tree when the root is absent or
 * has nothing beneath it — the full list's disabled reasons then explain why
 * nothing is pickable.
 */
export const scopeTreeToRoot = (
  tree: DataTypeTree,
  rootBaseUrl: BaseUrl,
): DataTypeTree => {
  const root = tree.roots.find((node) => node.baseUrl === rootBaseUrl);
  if (!root || root.children.length === 0) {
    return tree;
  }

  const nodeById = indexTreeNodes(root.children);

  return { roots: root.children, nodeById, selectableCount: nodeById.size };
};

export const getDataTypeIconName = ({
  title,
  format,
  type,
}: Pick<DataTypeTreeNode, "title" | "format" | "type">): IconName => {
  switch (type) {
    case "boolean":
      return "squareCheck";
    case "number":
      return measurementTypeTitles.includes(title) ? "ruler" : "oneHundred";
    case "object":
      return "bracketsCurly";
    case "array":
      return "bracketsSquare";
    case "null":
      return "emptySet";
    case "string":
      switch (format) {
        case "uri":
          return "inputPipe";
        case "email":
          return "at";
        case "date":
          return "calendar";
        case "time":
          return "clock";
        case "date-time":
          return "calendarClock";
        default:
          break;
      }
      if (title === "Email") {
        return "at";
      }
      return identifierTypeTitles.includes(title) ? "inputPipe" : "text";
    default:
      return "asterisk";
  }
};
