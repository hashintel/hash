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
    if (dataType.metadata.recordId.baseUrl === excludedBaseUrl) {
      continue;
    }

    pool[dataType.schema.$id] = dataType.schema;

    if (
      dataType.schema.allOf?.some(
        ({ $ref }) => $ref === blockProtocolDataTypes.value.dataTypeId,
      )
    ) {
      targets.push(dataType.schema);
    }
  }

  const roots = buildDataTypeTreesForSelector({
    targetDataTypes: targets,
    dataTypePoolById: pool,
  });

  // The primitive types are served on demand by the type fetcher, so until
  // something references one the graph may have no copy of it to put in the
  // tree — offer the statically-known identity instead
  for (const rootType of primitiveRootTypes) {
    if (
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

  return { roots, nodeById, selectableCount: nodeById.size };
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
