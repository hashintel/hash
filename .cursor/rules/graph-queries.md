---
description: Graph queries – how to query, create, and update entities using the GraphQL API
globs: apps/hash-frontend/**/*.ts, apps/hash-frontend/**/*.tsx
alwaysApply: false
---
# Graph Queries in HASH Frontend

This guide explains how to query, create, and update entities using the GraphQL API in the HASH frontend.

## Overview

HASH uses a graph-based data model where entities are nodes and links connect them. The frontend interacts with this graph through GraphQL queries and mutations defined in `apps/hash-frontend/src/graphql/queries/knowledge/entity.queries.ts`.

## Available Operations

### Querying Entities

Use `queryEntitySubgraphQuery` to fetch entities and their relationships.

```typescript
import { useQuery } from "@apollo/client";
import { getRoots, getOutgoingLinkAndTargetEntities } from "@blockprotocol/graph/stdlib";
import { deserializeQueryEntitySubgraphResponse } from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  generateEntityIdFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes, systemLinkEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import type { QueryEntitySubgraphQuery, QueryEntitySubgraphQueryVariables } from "../../graphql/api-types.gen";
import { queryEntitySubgraphQuery } from "../../graphql/queries/knowledge/entity.queries";

// Query entities by type
const { data, loading } = useQuery<QueryEntitySubgraphQuery, QueryEntitySubgraphQueryVariables>(
  queryEntitySubgraphQuery,
  {
    variables: {
      request: {
        filter: {
          all: [
            // Filter by webId (user/org scope)
            {
              equal: [{ path: ["webId"] }, { parameter: webId }],
            },
            // Filter by entity type
            generateVersionedUrlMatchingFilter(
              systemEntityTypes.dashboard.entityTypeId,
              { ignoreParents: true },
            ),
            // Exclude archived entities
            { equal: [{ path: ["archived"] }, { parameter: false }] },
          ],
        },
        graphResolveDepths: {
          inheritsFrom: 255,
          isOfType: true,
        },
        // Traverse outgoing links to get linked entities
        traversalPaths: [
          {
            edges: [
              { kind: "has-left-entity", direction: "incoming" },
              { kind: "has-right-entity", direction: "outgoing" },
            ],
          },
        ],
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    },
    skip: !webId,
    fetchPolicy: "cache-and-network",
  },
);
```

### Parsing Subgraph Responses

```typescript
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

// Parse the subgraph response
const entities = useMemo(() => {
  if (!data) return [];

  const { subgraph } = deserializeQueryEntitySubgraphResponse<MyEntityType>(
    data.queryEntitySubgraph,
  );

  // Get root entities
  const rootEntities = getRoots(subgraph);

  return rootEntities.map((entity) => {
    // Simplify property keys (e.g., "https://...name/" → "name")
    const { name, description } = simplifyProperties(entity.properties);

    // Get outgoing links to related entities
    const outgoingLinks = getOutgoingLinkAndTargetEntities(
      subgraph,
      entity.metadata.recordId.entityId,
    );

    // Filter links by type
    const linkedItems = outgoingLinks
      .filter(({ linkEntity }) =>
        linkEntity[0]?.metadata.entityTypeIds.includes(
          systemLinkEntityTypes.has.linkEntityTypeId,
        ),
      )
      .map(({ rightEntity }) => rightEntity[0]);

    return { entityId: entity.metadata.recordId.entityId, name, linkedItems };
  });
}, [data]);
```

### Creating Entities

Use `createEntityMutation` to create new entities.

```typescript
import { useMutation } from "@apollo/client";
import { HashEntity, mergePropertyObjectAndMetadata } from "@local/hash-graph-sdk/entity";
import type { CreateEntityMutation, CreateEntityMutationVariables } from "../../graphql/api-types.gen";
import { createEntityMutation } from "../../graphql/queries/knowledge/entity.queries";

const [createEntity] = useMutation<CreateEntityMutation, CreateEntityMutationVariables>(
  createEntityMutation,
);

// Create an entity
const handleCreate = async () => {
  const properties: MyEntityProperties = {
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/": "My Entity",
    "https://blockprotocol.org/@blockprotocol/types/property-type/description/": "A description",
  };

  const { data } = await createEntity({
    variables: {
      entityTypeIds: [systemEntityTypes.myType.entityTypeId],
      webId: activeWorkspaceWebId,
      properties: mergePropertyObjectAndMetadata<MyEntityType>(properties, undefined),
    },
  });

  const createdEntity = data?.createEntity
    ? new HashEntity(data.createEntity)
    : null;

  if (createdEntity) {
    const entityId = createdEntity.metadata.recordId.entityId;
    // Use the entity...
  }
};
```

### Creating Link Entities

Link entities connect two entities. Use `createEntityMutation` with `linkData`.

```typescript
// Create a link between a parent and child entity
await createEntity({
  variables: {
    entityTypeIds: [systemLinkEntityTypes.has.linkEntityTypeId],
    webId: activeWorkspaceWebId,
    properties: mergePropertyObjectAndMetadata({}, undefined),
    linkData: {
      leftEntityId: parentEntityId,  // Source entity
      rightEntityId: childEntityId,   // Target entity
    },
  },
});
```

### Updating Entities

Use `updateEntityMutation` with property patches.

```typescript
import type { UpdateEntityMutation, UpdateEntityMutationVariables } from "../../graphql/api-types.gen";
import { updateEntityMutation } from "../../graphql/queries/knowledge/entity.queries";
import { systemPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

const [updateEntity] = useMutation<UpdateEntityMutation, UpdateEntityMutationVariables>(
  updateEntityMutation,
);

// Update entity properties
await updateEntity({
  variables: {
    entityUpdate: {
      entityId: entity.metadata.recordId.entityId,
      propertyPatches: [
        {
          op: "add",  // Use "add" for new or existing properties, "remove" to delete
          path: [systemPropertyTypes.myProperty.propertyTypeBaseUrl],
          property: {
            value: "new value",
            metadata: {
              dataTypeId: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
        },
      ],
    },
  },
});
```

## Key Types and Utilities

### Property Patch Operations

| Op | Description |
|----|-------------|
| `add` | Add or update a property |
| `remove` | Remove a property |
| `replace` | Replace an existing property (use `add` for simpler semantics) |

### Data Type IDs

Common data type IDs for property metadata:

- **Text**: `https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1`
- **Object**: `https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1`
- **Number**: `https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1`
- **Boolean**: `https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1`
- **URI**: `https://hash.ai/@h/types/data-type/uri/v/1`

### Traversal Paths for Links

To fetch linked entities, use `traversalPaths`:

```typescript
traversalPaths: [
  {
    edges: [
      { kind: "has-left-entity", direction: "incoming" },
      { kind: "has-right-entity", direction: "outgoing" },
    ],
  },
],
```

This fetches entities linked via outgoing links from the queried entities.

## Best Practices

1. **Always use typed queries**: Import types from `api-types.gen` for type safety.

2. **Use simplifyProperties**: Converts verbose property URLs to camelCase keys.

3. **Handle loading and error states**: Always check `loading` and provide fallbacks.

4. **Use appropriate fetch policies**:
   - `cache-and-network`: Good for lists that should update
   - `network-only`: For data that must be fresh
   - `cache-first`: For rarely-changing data

5. **Skip queries when dependencies are missing**:

   ```typescript
   skip: !webId || !entityId,
   ```

6. **Refetch after mutations**: Either use `refetchQueries` or call `refetch()` manually.

7. **Use system type IDs**: Import from `@local/hash-isomorphic-utils/ontology-type-ids` for type safety.

## Querying Entity Permissions

When you need to check if the current user can edit an entity, set `includePermissions: true` in the query request. This returns `entityPermissions` on the response, which maps entity IDs to permission objects.

### Requesting Permissions

```typescript
const { data } = useQuery<QueryEntitySubgraphQuery, QueryEntitySubgraphQueryVariables>(
  queryEntitySubgraphQuery,
  {
    variables: {
      request: {
        filter: { /* your filter */ },
        graphResolveDepths: { inheritsFrom: 255, isOfType: true },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: true, // Enable permission checking
      },
    },
  },
);
```

### Using Permissions

The `entityPermissions` field is a record mapping entity IDs to permission objects with an `update` boolean:

```typescript
import type { EntityId } from "@blockprotocol/type-system";

// Extract permissions from the response
const entityPermissions = data?.queryEntitySubgraph.entityPermissions;

// Check if user can edit a specific entity
const canEdit = useMemo(() => {
  if (!entityId || !entityPermissions) {
    return false;
  }
  return entityPermissions[entityId]?.update ?? false;
}, [entityId, entityPermissions]);

// Use in UI to conditionally show edit controls
{canEdit && (
  <IconButton onClick={handleEdit}>
    <EditIcon />
  </IconButton>
)}
```

## Examples in Codebase

- **Querying with links**: `apps/hash-frontend/src/pages/notifications.page/notifications-with-links-context.tsx`
- **Creating entities**: `apps/hash-frontend/src/pages/@/[shortname]/entities/[entity-uuid].page/create-entity-page.tsx`
- **Updating entities**: `apps/hash-frontend/src/components/hooks/use-update-authenticated-user.ts`
- **Dashboard queries**: `apps/hash-frontend/src/pages/dashboards.page.tsx`
