import {
  ensureSystemGraphIsInitialized,
  ImpureGraphContext,
} from "@apps/hash-api/src/graph";
import { User } from "@apps/hash-api/src/graph/knowledge/system-types/user";
import { createDataType } from "@apps/hash-api/src/graph/ontology/primitive/data-type";
import {
  createEntityType,
  getEntityTypeById,
  updateEntityType,
} from "@apps/hash-api/src/graph/ontology/primitive/entity-type";
import { createPropertyType } from "@apps/hash-api/src/graph/ontology/primitive/property-type";
import { TypeSystemInitializer } from "@blockprotocol/type-system";
import { Logger } from "@local/hash-backend-utils/logger";
import {
  ConstructEntityTypeParams,
  SystemDefinedProperties,
} from "@local/hash-graphql-shared/graphql/types";
import {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  isOwnedOntologyElementMetadata,
  linkEntityTypeUrl,
  OwnedById,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";

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

  textDataType = await createDataType(graphContext, {
    ownedById: testUser.accountId as OwnedById,
    schema: {
      title: "Text",
      type: "string",
    },
    actorId: testUser.accountId,
  });

  await Promise.all([
    createEntityType(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      schema: {
        title: "Worker",
        type: "object",
        properties: {},
      },
      actorId: testUser.accountId,
    }).then((val) => {
      workerEntityType = val;
    }),
    createEntityType(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      schema: {
        title: "Address",
        type: "object",
        properties: {},
      },
      actorId: testUser.accountId,
    }).then((val) => {
      addressEntityType = val;
    }),
    createPropertyType(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      schema: {
        title: "Favorite Book",
        oneOf: [{ $ref: textDataType.schema.$id }],
      },
      actorId: testUser.accountId,
    }).then((val) => {
      favoriteBookPropertyType = val;
    }),
    createPropertyType(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      schema: {
        title: "Name",
        oneOf: [{ $ref: textDataType.schema.$id }],
      },
      actorId: testUser.accountId,
    }).then((val) => {
      namePropertyType = val;
    }),
    createEntityType(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      schema: {
        title: "Knows",
        description: "Knows of someone",
        type: "object",
        allOf: [{ $ref: linkEntityTypeUrl }],
        properties: {},
        ...({} as Record<SystemDefinedProperties, never>),
      },
      actorId: testUser.accountId,
    }).then((val) => {
      knowsLinkEntityType = val;
    }),
    createEntityType(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      schema: {
        title: "Previous Address",
        description: "A previous address of something.",
        type: "object",
        allOf: [{ $ref: linkEntityTypeUrl }],
        properties: {},
      },
      actorId: testUser.accountId,
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

describe("Entity type CRU", () => {
  let createdEntityType: EntityTypeWithMetadata;

  it("can create an entity type", async () => {
    createdEntityType = await createEntityType(graphContext, {
      ownedById: testUser.accountId as OwnedById,
      schema: entityTypeSchema,
      actorId: testUser.accountId,
    });
  });

  it("can read an entity type", async () => {
    const fetchedEntityType = await getEntityTypeById(graphContext, {
      entityTypeId: createdEntityType.schema.$id,
    });

    expect(fetchedEntityType.schema).toEqual(createdEntityType.schema);
  });

  const updatedTitle = "New text!";

  it("can update an entity type", async () => {
    expect(
      isOwnedOntologyElementMetadata(createdEntityType.metadata) &&
        createdEntityType.metadata.provenance.recordCreatedById,
    ).toBe(testUser.accountId);

    const updatedEntityType = await updateEntityType(graphContext, {
      entityTypeId: createdEntityType.schema.$id,
      schema: { ...entityTypeSchema, title: updatedTitle },
      actorId: testUser2.accountId,
    }).catch((err) => Promise.reject(err.data));

    expect(
      isOwnedOntologyElementMetadata(updatedEntityType.metadata) &&
        updatedEntityType.metadata.provenance.recordCreatedById,
    ).toBe(testUser2.accountId);
  });
});
