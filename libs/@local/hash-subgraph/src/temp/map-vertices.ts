import {
  DataType,
  EntityType,
  OneOf,
  PropertyType,
  PropertyValues,
  validateBaseUri,
  validateVersionedUri,
  VersionedUri,
} from "@blockprotocol/type-system";
import {
  DataType as DataTypeGraphApi,
  EntityMetadata as EntityMetadataGraphApi,
  EntityType as EntityTypeGraphApi,
  EntityVersion as EntityVersionGraphApi,
  KnowledgeGraphVertex as KnowledgeGraphVertexGraphApi,
  LinkData as LinkDataGraphApi,
  OntologyElementMetadata as OntologyElementMetadataGraphApi,
  OntologyVertex as OntologyVertexGraphApi,
  PropertyType as PropertyTypeGraphApi,
  Vertices as VerticesGraphApi,
} from "@local/hash-graph-client";

import {
  BaseUri,
  EntityId,
  EntityMetadata,
  EntityPropertiesObject,
  EntityTemporalVersioningMetadata,
  isEntityId,
  LinkData,
  OntologyElementMetadata,
  Timestamp,
  UpdatedById,
} from "../types";
import {
  KnowledgeGraphVertex,
  OntologyVertex,
  Vertices,
} from "../types/subgraph/vertices";

const mapDataType = (dataType: DataTypeGraphApi): DataType => {
  const idResult = validateVersionedUri(dataType.$id);
  if (idResult.type === "Err") {
    throw new Error(
      `Expected type ID to be a Versioned URI:\n${JSON.stringify(
        idResult.inner,
      )}`,
    );
  }
  const { inner: $id } = idResult;

  return {
    ...dataType,
    $id,
  };
};

const mapPropertyType = (propertyType: PropertyTypeGraphApi): PropertyType => {
  if (propertyType.oneOf.length < 1) {
    throw new Error(
      `Property Type had an empty one of:\n${JSON.stringify(propertyType)}`,
    );
  }

  const idResult = validateVersionedUri(propertyType.$id);
  if (idResult.type === "Err") {
    throw new Error(
      `Expected type ID to be a Versioned URI:\n${JSON.stringify(
        idResult.inner,
      )}`,
    );
  }
  const { inner: $id } = idResult;

  return {
    ...propertyType,
    $id,
    // We checked the length above
    oneOf: propertyType.oneOf as OneOf<PropertyValues>["oneOf"],
  };
};

const mapEntityType = (entityType: EntityTypeGraphApi): EntityType => {
  /** @todo - The OpenAPI spec generator fails to appropriately type `properties` or `links` */
  return entityType as EntityType;
};

export const mapOntologyMetadata = (
  metadata: OntologyElementMetadataGraphApi,
): OntologyElementMetadata => {
  return {
    ...metadata,
    recordId: {
      baseUri: metadata.recordId.baseUri as BaseUri,
      version: metadata.recordId.version,
    },
    provenance: {
      updatedById: metadata.provenance.updatedById as UpdatedById,
    },
    ...("fetchedAt" in metadata
      ? { fetchedAt: metadata.fetchedAt as Timestamp }
      : ({} as {
          fetchedAt: Timestamp;
        })),
  };
};

const mapOntologyVertex = (vertex: OntologyVertexGraphApi): OntologyVertex => {
  switch (vertex.kind) {
    case "dataType": {
      return {
        kind: vertex.kind,
        inner: {
          ...vertex.inner,
          metadata: mapOntologyMetadata(vertex.inner.metadata),
          schema: mapDataType(vertex.inner.schema),
        },
      };
    }
    case "propertyType": {
      return {
        kind: vertex.kind,
        inner: {
          ...vertex.inner,
          metadata: mapOntologyMetadata(vertex.inner.metadata),
          schema: mapPropertyType(vertex.inner.schema),
        },
      };
    }
    case "entityType": {
      return {
        kind: vertex.kind,
        inner: {
          ...vertex.inner,
          metadata: mapOntologyMetadata(vertex.inner.metadata),
          schema: mapEntityType(vertex.inner.schema),
        },
      };
    }
  }
};

export const mapEntityVersion = (
  entityVersion: EntityVersionGraphApi,
): EntityTemporalVersioningMetadata => {
  return {
    transactionTime: {
      start: {
        kind: "inclusive",
        limit: entityVersion.transactionTime.start as Timestamp,
      },
      end: {
        kind: "exclusive",
        limit: entityVersion.transactionTime.end as Timestamp,
      },
    },
    decisionTime: {
      start: {
        kind: "inclusive",
        limit: entityVersion.decisionTime.start as Timestamp,
      },
      end: {
        kind: "exclusive",
        limit: entityVersion.decisionTime.end as Timestamp,
      },
    },
  };
};

export const mapEntityMetadata = (
  metadata: EntityMetadataGraphApi,
): EntityMetadata => {
  return {
    ...metadata,
    recordId: {
      ...metadata.recordId,
      entityId: metadata.recordId.entityId as EntityId,
    },
    temporalVersioning: mapEntityVersion(metadata.version),
    entityTypeId: metadata.entityTypeId as VersionedUri,
    provenance: {
      updatedById: metadata.provenance.updatedById as UpdatedById,
    },
  };
};

const mapLinkData = (linkData: LinkDataGraphApi): LinkData => {
  return {
    leftEntityId: linkData.leftEntityId as EntityId,
    rightEntityId: linkData.rightEntityId as EntityId,
    leftToRightOrder: linkData.leftToRightOrder,
    rightToLeftOrder: linkData.rightToLeftOrder,
  };
};

const mapKnowledgeGraphVertex = (
  vertex: KnowledgeGraphVertexGraphApi,
): KnowledgeGraphVertex => {
  return {
    ...vertex,
    inner: {
      ...vertex.inner,
      properties: vertex.inner.properties as EntityPropertiesObject,
      ...(vertex.inner.linkData
        ? { linkData: mapLinkData(vertex.inner.linkData) }
        : ({} as { linkData: never })),
      metadata: mapEntityMetadata(vertex.inner.metadata),
    },
  };
};

export const mapVertices = (vertices: VerticesGraphApi): Vertices => {
  const mappedVertices: Vertices = {};

  // Trying to build this with `Object.fromEntries` breaks tsc and leads to `any` typed values
  for (const [baseId, inner] of Object.entries(vertices)) {
    const result = validateBaseUri(baseId);
    if (result.type === "Ok") {
      // ------------ Ontology Type case ----------------
      const baseUri = result.inner as BaseUri;

      mappedVertices[baseUri] = Object.fromEntries(
        Object.entries(inner).map(([version, vertex]) => {
          const versionNumber = Number(version);

          if (Number.isNaN(versionNumber)) {
            throw new Error(
              `Unrecognized ontology type version, expected a number but got: ${version}`,
            );
          }

          if (
            vertex.kind !== "dataType" &&
            vertex.kind !== "propertyType" &&
            vertex.kind !== "entityType"
          ) {
            throw new Error(
              `Expected an ontology vertex but found:\n${JSON.stringify(
                vertex,
              )}`,
            );
          }

          const mappedVertex = mapOntologyVertex(vertex);
          return [versionNumber, mappedVertex];
        }),
      );
    } else if (isEntityId(baseId)) {
      // ------------ Entity (knowledge-graph) case ----------------
      mappedVertices[baseId] = Object.fromEntries(
        Object.entries(inner).map(([version, vertex]) => {
          const timestamp = Date.parse(version);

          if (Number.isNaN(timestamp)) {
            throw new Error(
              `Unrecognized entity version, expected an ISO-formatted timestamp but got: ${version}`,
            );
          }

          if (vertex.kind !== "entity") {
            throw new Error(
              `Expected an entity vertex but found:\n${JSON.stringify(vertex)}`,
            );
          }

          const mappedVertex = mapKnowledgeGraphVertex(vertex);
          return [version, mappedVertex];
        }),
      );
    } else {
      throw new Error(
        `Unrecognized or invalid vertices outer key type: ${baseId}`,
      );
    }
  }

  return mappedVertices;
};
