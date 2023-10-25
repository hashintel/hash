import { deleteKratosIdentity } from "@apps/hash-api/src/auth/ory-kratos";
import {
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@apps/hash-api/src/graph";
import { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { createDataType } from "@apps/hash-api/src/graph/ontology/primitive/data-type";
import {
  createEntityType,
  getEntityTypeById,
  getEntityTypeSubgraphById,
  updateEntityType,
} from "@apps/hash-api/src/graph/ontology/primitive/entity-type";
import { createPropertyType } from "@apps/hash-api/src/graph/ontology/primitive/property-type";
import { systemAccounts } from "@apps/hash-api/src/graph/system-accounts";
import { publicUserAccountId } from "@apps/hash-api/src/graphql/context";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import {
  ConstructEntityTypeParams,
  SystemDefinedProperties,
} from "@local/hash-graphql-shared/graphql/types";
import {
  currentTimeInstantTemporalAxes,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  isOwnedOntologyElementMetadata,
  linkEntityTypeUrl,
  OwnedById,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";

import { resetGraph } from "../../../test-server";
import { createTestImpureGraphContext, createTestUser } from "../../../util";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const graphContext: ImpureGraphContext = createTestImpureGraphContext();

let testUser: User;
let testUser2: User;
let entityTypeSchema: ConstructEntityTypeParams;
let workerEntityType: EntityTypeWithMetadata;
let textDataType: DataTypeWithMetadata;
let namePropertyType: PropertyTypeWithMetadata;
let favoriteBookPropertyType: PropertyTypeWithMetadata;
let knowsLinkEntityType: EntityTypeWithMetadata;
let previousAddressLinkEntityType: EntityTypeWithMetadata;
let addressEntityType: EntityTypeWithMetadata;

beforeAll(async () => {
  await TypeSystemInitializer.initialize();
  await ensureSystemGraphIsInitialized({ logger, context: graphContext });

  testUser = await createTestUser(graphContext, "entity-type-test-1", logger);
  testUser2 = await createTestUser(graphContext, "entity-type-test-2", logger);

  const authentication = { actorId: testUser.accountId };

  textDataType = await createDataType(graphContext, authentication, {
    ownedById: testUser.accountId as OwnedById,
    schema: {
      title: "Text",
      type: "string",
    },
  });

  await Promise.all([
    createEntityType(graphContext, authentication, {
      ownedById: testUser.accountId as OwnedById,
      schema: {
        title: "Worker",
        type: "object",
        properties: {},
      },
    }).then((val) => {
      workerEntityType = val;
    }),
    createEntityType(graphContext, authentication, {
      ownedById: testUser.accountId as OwnedById,
      schema: {
        title: "Address",
        type: "object",
        properties: {},
      },
    }).then((val) => {
      addressEntityType = val;
    }),
    createPropertyType(graphContext, authentication, {
      ownedById: testUser.accountId as OwnedById,
      schema: {
        title: "Favorite Book",
        oneOf: [{ $ref: textDataType.schema.$id }],
      },
    }).then((val) => {
      favoriteBookPropertyType = val;
    }),
    createPropertyType(graphContext, authentication, {
      ownedById: testUser.accountId as OwnedById,
      schema: {
        title: "Name",
        oneOf: [{ $ref: textDataType.schema.$id }],
      },
    }).then((val) => {
      namePropertyType = val;
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
    }).then((val) => {
      knowsLinkEntityType = val;
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
    }).then((val) => {
      previousAddressLinkEntityType = val;
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
        ordered: false,
      },
      [previousAddressLinkEntityType.schema.$id]: {
        type: "array",
        items: {
          oneOf: [{ $ref: addressEntityType.schema.$id }],
        },
        ordered: true,
      },
    },
  };
});

afterAll(async () => {
  await deleteKratosIdentity({
    kratosIdentityId: systemAccounts.kratosIdentityId,
  });
  await deleteKratosIdentity({
    kratosIdentityId: testUser.kratosIdentityId,
  });
  await deleteKratosIdentity({
    kratosIdentityId: testUser2.kratosIdentityId,
  });

  await resetGraph();
});

describe("Entity type CRU", () => {
  let createdEntityType: EntityTypeWithMetadata;

  it("can create an entity type", async () => {
    const authentication = { actorId: testUser.accountId };

    createdEntityType = await createEntityType(graphContext, authentication, {
      ownedById: testUser.accountId as OwnedById,
      schema: entityTypeSchema,
    });
  });

  it("can read an entity type", async () => {
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

  it("can update an entity type", async () => {
    expect(
      isOwnedOntologyElementMetadata(createdEntityType.metadata) &&
        createdEntityType.metadata.custom.provenance.recordCreatedById,
    ).toBe(testUser.accountId);

    const authentication = { actorId: testUser2.accountId };

    const updatedEntityType = await updateEntityType(
      graphContext,
      authentication,
      {
        entityTypeId: createdEntityType.schema.$id,
        schema: { ...entityTypeSchema, title: updatedTitle },
      },
    ).catch((err) => Promise.reject(err.data));

    expect(
      isOwnedOntologyElementMetadata(updatedEntityType.metadata) &&
        updatedEntityType.metadata.custom.provenance.recordCreatedById,
    ).toBe(testUser2.accountId);
  });

  it("can load an external type on demand", async () => {
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
