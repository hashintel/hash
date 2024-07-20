import { beforeAll, describe, expect, test } from "vitest";
import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import { ensureSystemGraphIsInitialized } from "@apps/hash-api/src/graph/ensure-system-graph-is-initialized";
import type { Org } from "@apps/hash-api/src/graph/knowledge/system-types/org";
import type {
  joinOrg,
  User,
} from "@apps/hash-api/src/graph/knowledge/system-types/user";
import {
  createEntityType,
  getEntityTypeById,
  getEntityTypeSubgraphById,
  updateEntityType,
} from "@apps/hash-api/src/graph/ontology/primitive/entity-type";
import { createPropertyType } from "@apps/hash-api/src/graph/ontology/primitive/property-type";
import { Logger } from "@local/hash-backend-utils/logger";
import { publicUserAccountId } from "@local/hash-backend-utils/public-user-account-id";
import type {
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-graph-types/ontology";
import type { OwnedById } from "@local/hash-graph-types/web";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import type {
  ConstructEntityTypeParams,
  SystemDefinedProperties,
} from "@local/hash-isomorphic-utils/types";
import {
  isOwnedOntologyElementMetadata,
  linkEntityTypeUrl,
} from "@local/hash-subgraph";

import { resetGraph } from "../../../test-server";
import {
  createTestImpureGraphContext,
  createTestOrg,
  createTestUser,
  textDataTypeId,
} from "../../../util";

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext = createTestImpureGraphContext();

let testOrg: Org;
let testUser: User;
let testUser2: User;
let entityTypeSchema: ConstructEntityTypeParams;
let workerEntityType: EntityTypeWithMetadata;
let namePropertyType: PropertyTypeWithMetadata;
let favoriteBookPropertyType: PropertyTypeWithMetadata;
let knowsLinkEntityType: EntityTypeWithMetadata;
let previousAddressLinkEntityType: EntityTypeWithMetadata;
let addressEntityType: EntityTypeWithMetadata;

beforeAll(async () => {
  await ensureSystemGraphIsInitialized({ logger, context: graphContext });

  testUser = await createTestUser(graphContext, "entity-type-test-1", logger);
  testUser2 = await createTestUser(graphContext, "entity-type-test-2", logger);

  const authentication = { actorId: testUser.accountId };

  testOrg = await createTestOrg(
    graphContext,
    authentication,
    "entitytypetestorg",
  );
  await joinOrg(graphContext, authentication, {
    userEntityId: testUser2.entity.metadata.recordId.entityId,
    orgEntityId: testOrg.entity.metadata.recordId.entityId,
  });

  await Promise.all([
    createEntityType(graphContext, authentication, {
      ownedById: testUser.accountId as OwnedById,
      schema: {
        title: "Worker",
        type: "object",
        properties: {},
      },
      relationships: [
        {
          relation: "viewer",
          subject: {
            kind: "public",
          },
        },
      ],
    }).then((value) => {
      workerEntityType = value;
    }),
    createEntityType(graphContext, authentication, {
      ownedById: testUser.accountId as OwnedById,
      schema: {
        title: "Address",
        type: "object",
        properties: {},
      },
      relationships: [
        {
          relation: "viewer",
          subject: {
            kind: "public",
          },
        },
      ],
    }).then((value) => {
      addressEntityType = value;
    }),
    createPropertyType(graphContext, authentication, {
      ownedById: testUser.accountId as OwnedById,
      schema: {
        title: "Favorite Book",
        oneOf: [{ $ref: textDataTypeId }],
      },
      relationships: [
        {
          relation: "viewer",
          subject: {
            kind: "public",
          },
        },
      ],
    }).then((value) => {
      favoriteBookPropertyType = value;
    }),
    createPropertyType(graphContext, authentication, {
      ownedById: testUser.accountId as OwnedById,
      schema: {
        title: "Name",
        oneOf: [{ $ref: textDataTypeId }],
      },
      relationships: [
        {
          relation: "viewer",
          subject: {
            kind: "public",
          },
        },
      ],
    }).then((value) => {
      namePropertyType = value;
    }),
    createEntityType(graphContext, authentication, {
      ownedById: testUser.accountId as OwnedById,
      schema: {
        title: "Knows",
        description: "Knows of someone",
        type: "object",
        allOf: [{ $ref: linkEntityTypeUrl }],
        properties: {},
        ...({} as Record<SystemDefinedProperties, never>),
      },
      relationships: [
        {
          relation: "viewer",
          subject: {
            kind: "public",
          },
        },
      ],
    }).then((value) => {
      knowsLinkEntityType = value;
    }),
    createEntityType(graphContext, authentication, {
      ownedById: testUser.accountId as OwnedById,
      schema: {
        title: "Previous Address",
        description: "A previous address of something.",
        type: "object",
        allOf: [{ $ref: linkEntityTypeUrl }],
        properties: {},
      },
      relationships: [
        {
          relation: "viewer",
          subject: {
            kind: "public",
          },
        },
      ],
    }).then((value) => {
      previousAddressLinkEntityType = value;
    }),
  ]);

  entityTypeSchema = {
    title: "Some",
    type: "object",
    properties: {
      [favoriteBookPropertyType.metadata.recordId.baseUrl]: {
        $ref: favoriteBookPropertyType.schema.$id,
      },
      [namePropertyType.metadata.recordId.baseUrl]: {
        $ref: namePropertyType.schema.$id,
      },
    },
    links: {
      [knowsLinkEntityType.schema.$id]: {
        type: "array",
        items: {
          oneOf: [{ $ref: workerEntityType.schema.$id }],
        },
      },
      [previousAddressLinkEntityType.schema.$id]: {
        type: "array",
        items: {
          oneOf: [{ $ref: addressEntityType.schema.$id }],
        },
      },
    },
  };

  return async () => {
    await deleteKratosIdentity({
      kratosIdentityId: testUser.kratosIdentityId,
    });
    await deleteKratosIdentity({
      kratosIdentityId: testUser2.kratosIdentityId,
    });
    await resetGraph();
  };
});

describe("entity type CRU", () => {
  let createdEntityType: EntityTypeWithMetadata;

  test("can create an entity type", async () => {
    const authentication = { actorId: testUser.accountId };

    createdEntityType = await createEntityType(graphContext, authentication, {
      ownedById: testOrg.accountGroupId as OwnedById,
      schema: entityTypeSchema,
      relationships: [
        {
          relation: "setting",
          subject: {
            kind: "setting",
            subjectId: "updateFromWeb",
          },
        },
        {
          relation: "viewer",
          subject: {
            kind: "public",
          },
        },
      ],
    });
  });

  test("can read an entity type", async () => {
    const authentication = { actorId: testUser.accountId };

    const fetchedEntityType = await getEntityTypeById(
      graphContext,
      authentication,
      {
        entityTypeId: createdEntityType.schema.$id,
      },
    );

    expect(fetchedEntityType.schema).toEqual(createdEntityType.schema);
  });

  const updatedTitle = "New text!";

  test("can update an entity type", async () => {
    expect(
      isOwnedOntologyElementMetadata(createdEntityType.metadata) &&
        createdEntityType.metadata.provenance.edition.createdById,
    ).toBe(testUser.accountId);

    const authentication = { actorId: testUser2.accountId };

    const updatedEntityType = await updateEntityType(
      graphContext,
      authentication,
      {
        entityTypeId: createdEntityType.schema.$id,
        schema: { ...entityTypeSchema, title: updatedTitle },
        relationships: [
          {
            relation: "setting",
            subject: {
              kind: "setting",
              subjectId: "updateFromWeb",
            },
          },
          { relation: "instantiator", subject: { kind: "public" } },
        ],
      },
    ).catch((error) => Promise.reject(error.data));

    expect(
      isOwnedOntologyElementMetadata(updatedEntityType.metadata) &&
        updatedEntityType.metadata.provenance.edition.createdById,
    ).toBe(testUser2.accountId);
  });

  test.skip("can load an external type on demand", async () => {
    const authentication = { actorId: testUser.accountId };

    const entityTypeId =
      "https://blockprotocol.org/@blockprotocol/types/entity-type/thing/v/1";

    await expect(
      getEntityTypeById(
        graphContext,
        { actorId: publicUserAccountId },
        { entityTypeId },
      ),
    ).rejects.toThrow("Could not find entity type with ID");

    await expect(
      getEntityTypeSubgraphById(graphContext, authentication, {
        entityTypeId,
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
      }),
    ).resolves.not.toThrow();
  });
});
