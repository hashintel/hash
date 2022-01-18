import "../loadTestEnv";
import { PostgresAdapter } from "@hashintel/hash-api/src/db";
import {
  Aggregation,
  Entity,
  EntityType,
  User,
} from "@hashintel/hash-api/src/model";
import { WayToUseHash } from "@hashintel/hash-api/src/graphql/apiTypes.gen";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { recreateDbAndRunSchemaMigrations } from "../setup";

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

let db: PostgresAdapter;

let existingUser: User;

let dummyEntityType: EntityType;

let entityTypeCounter = 0;

const createEntityType = async () => {
  entityTypeCounter += 1;
  return EntityType.create(db, {
    accountId: existingUser.accountId,
    createdByAccountId: existingUser.entityId,
    name: `Dummy-${entityTypeCounter}`,
  });
};

const createEntity = async (params: { versioned: boolean }) =>
  Entity.create(db, {
    accountId: existingUser.accountId,
    createdByAccountId: existingUser.entityId,
    versioned: params.versioned,
    entityTypeId: dummyEntityType.entityId,
    properties: {},
  });

beforeAll(async () => {
  await recreateDbAndRunSchemaMigrations();

  db = new PostgresAdapter(
    {
      host: "localhost",
      user: "postgres",
      port: 5432,
      database: process.env.HASH_PG_DATABASE ?? "backend_integration_tests",
      password: "postgres",
      maxPoolSize: 10,
    },
    logger,
  );

  existingUser = await User.createUser(db, {
    shortname: "test-user",
    preferredName: "Alice",
    emails: [{ address: "alice@hash.test", primary: true, verified: true }],
    infoProvidedAtSignup: { usingHow: WayToUseHash.ByThemselves },
  });

  dummyEntityType = await createEntityType();
});

describe("Aggregation model class ", () => {
  it("static create method can create an aggregation with a non-versioned source entity", async () => {
    const accountId = existingUser.accountId;
    const createdByAccountId = existingUser.entityId;

    const source = await Entity.create(db, {
      accountId,
      createdByAccountId,
      versioned: false,
      entityTypeId: dummyEntityType.entityId,
      properties: {},
    });

    const aggregation = await Aggregation.create(db, {
      stringifiedPath: "$.test",
      source,
      createdBy: existingUser,
      operation: {
        entityTypeId: dummyEntityType.entityId,
      },
    });

    expect(aggregation.sourceAccountId).toBe(source.accountId);
    expect(aggregation.sourceEntityId).toBe(source.entityId);
    expect(aggregation.sourceEntityVersionIds.has(source.entityVersionId)).toBe(
      true,
    );
    expect(aggregation.createdByAccountId).toBe(existingUser.entityId);
  });

  it("results method retrieves aggregation results", async () => {
    const accountId = existingUser.accountId;
    const createdByAccountId = existingUser.entityId;

    const resultEntityType = await createEntityType();

    const entityA = await Entity.create(db, {
      accountId,
      createdByAccountId,
      versioned: false,
      entityTypeId: dummyEntityType.entityId,
      properties: {},
    });

    const [entityB, entityC] = await Promise.all([
      Entity.create(db, {
        accountId,
        createdByAccountId,
        versioned: false,
        entityTypeId: resultEntityType.entityId,
        properties: {},
      }),
      Entity.create(db, {
        accountId,
        createdByAccountId,
        versioned: false,
        entityTypeId: resultEntityType.entityId,
        properties: {},
      }),
    ]);

    const aggregation = await Aggregation.create(db, {
      source: entityA,
      operation: {
        entityTypeId: resultEntityType.entityId,
      },
      stringifiedPath: "$.test",
      createdBy: existingUser,
    });

    const results = await aggregation.getResults(db);

    expect(results).toHaveLength(2);
    expect(
      results.find((result) => entityB.isEquivalentTo(result)),
    ).not.toBeUndefined();
    expect(
      results.find((result) => entityC.isEquivalentTo(result)),
    ).not.toBeUndefined();
  });

  it("updateOperation method updates an aggregation operation with a non-versioned source entity", async () => {
    const accountId = existingUser.accountId;
    const createdByAccountId = existingUser.entityId;

    const source = await Entity.create(db, {
      accountId,
      createdByAccountId,
      versioned: false,
      entityTypeId: dummyEntityType.entityId,
      properties: {},
    });

    const aggregation = await Aggregation.create(db, {
      source,
      createdBy: existingUser,
      operation: {
        entityTypeId: dummyEntityType.entityId,
      },
      stringifiedPath: "$.testPath",
    });

    const newEntityType = await createEntityType();

    const updatedOperation = {
      entityTypeId: newEntityType.entityId,
      itemsPerPage: 15,
      pageNumber: 1,
    };

    await aggregation.updateOperation(db, {
      operation: updatedOperation,
    });

    const refetchedSourceAggregations = await source.getAggregations(db);

    expect(refetchedSourceAggregations).toHaveLength(1);

    const refetchedAggregation = refetchedSourceAggregations[0];

    expect(refetchedAggregation.createdAt).toEqual(aggregation.createdAt);
    expect(refetchedAggregation.operation).toEqual(updatedOperation);
  });

  it("delete method deletes an aggregation with a non-versioned source entity", async () => {
    const accountId = existingUser.accountId;
    const createdByAccountId = existingUser.entityId;

    const entityA = await Entity.create(db, {
      accountId,
      createdByAccountId,
      versioned: true,
      entityTypeId: dummyEntityType.entityId,
      properties: {},
    });

    const entityAVersionId1 = entityA.entityVersionId;

    const aggregation = await Aggregation.create(db, {
      stringifiedPath: "$.test",
      source: entityA,
      createdBy: existingUser,
      operation: {
        entityTypeId: dummyEntityType.entityId,
      },
    });

    await entityA.refetchLatestVersion(db);

    const entityAVersionId2 = entityA.entityVersionId;

    expect(entityAVersionId1).not.toBe(entityAVersionId2);

    const entityAVersion1 = (await Entity.getEntity(db, {
      accountId: entityA.accountId,
      entityVersionId: entityAVersionId1,
    }))!;

    expect(entityAVersion1).not.toBe(null);

    const entityAVersionId1Aggregations = await entityAVersion1.getAggregations(
      db,
    );

    expect(entityAVersionId1Aggregations).toHaveLength(0);

    const entityAVersion2 = (await Entity.getEntity(db, {
      accountId: entityA.accountId,
      entityVersionId: entityAVersionId2,
    }))!;

    expect(entityAVersion2).not.toBe(null);

    const entityAVersionId2Aggregations = await entityAVersion2.getAggregations(
      db,
    );

    expect(entityAVersionId2Aggregations).toHaveLength(1);
    expect(entityAVersionId2Aggregations[0]).toEqual(aggregation);
  });

  it("create/updateOperation/delete methods create different versions of a versioned source entity", async () => {
    const source = await createEntity({ versioned: true });

    const sourceVersionId1 = source.entityVersionId;

    const sourceVersion1Aggregations = await source.getAggregations(db);

    expect(sourceVersion1Aggregations).toHaveLength(0);

    // Create an aggregation

    const aggregation = await Aggregation.create(db, {
      stringifiedPath: "$.versionedSourceAggregation",
      source,
      createdBy: existingUser,
      operation: {
        entityTypeId: dummyEntityType.entityId,
      },
    });

    await source.refetchLatestVersion(db);

    const sourceVersionId2 = source.entityVersionId;

    expect(sourceVersionId1).not.toBe(sourceVersionId2);

    const sourceVersion2Aggregations = await source.getAggregations(db);

    expect(sourceVersion2Aggregations).toHaveLength(1);

    expect(sourceVersion2Aggregations[0]).toEqual(aggregation);

    // Unrelated update to the source to see if aggregation persists

    await source.updateEntityProperties(db, {
      updatedByAccountId: existingUser.accountId,
      properties: {
        testing: "test update that results in new source version",
      },
    });

    await source.refetchLatestVersion(db);

    const sourceVersionId3 = source.entityVersionId;

    expect(sourceVersionId2).not.toBe(sourceVersionId3);

    const sourceVersion3Aggregations = await source.getAggregations(db);

    expect(sourceVersion3Aggregations).toHaveLength(1);

    // expect(sourceVersion3Aggregations[0]).toEqual(aggregation);

    // Update the aggregation operation

    const newEntityType = await createEntityType();

    const updatedOperation = {
      entityTypeId: newEntityType.entityId,
    };

    await aggregation.updateOperation(db, {
      operation: updatedOperation,
    });

    await source.refetchLatestVersion(db);

    const sourceVersionId4 = source.entityVersionId;

    expect(sourceVersionId4).not.toBe(sourceVersionId3);

    const sourceVersion4Aggregations = await source.getAggregations(db);

    expect(sourceVersion4Aggregations).toHaveLength(1);

    // expect(sourceVersion4Aggregations[0]).toEqual(aggregation);

    // Delete the aggregation

    await aggregation.delete(db, {
      deletedByAccountId: existingUser.accountId,
    });

    await source.refetchLatestVersion(db);

    const sourceVersionId5 = source.entityVersionId;

    expect(sourceVersionId5).not.toBe(sourceVersionId4);

    const sourceVersion5Aggregations = await source.getAggregations(db);

    expect(sourceVersion5Aggregations).toHaveLength(0);

    // Let's check the source entity has the correct number of versions

    expect(await source.getHistory(db)).toHaveLength(5);
  });
});

afterAll(async () => {
  await db.close();
});
