import "../loadTestEnv";
import { PostgresAdapter } from "@hashintel/hash-api/src/db";
import { Entity, EntityType, Link, User } from "@hashintel/hash-api/src/model";
import { WayToUseHash } from "@hashintel/hash-api/src/graphql/apiTypes.gen";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { IntegrationTestsHandler } from "../setup";

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

let handler: IntegrationTestsHandler;

let db: PostgresAdapter;

let existingUser: User;

let dummyEntityType: EntityType;

beforeAll(async () => {
  handler = new IntegrationTestsHandler();
  await handler.init();

  db = new PostgresAdapter(
    {
      host: "localhost",
      user: "postgres",
      port: 5432,
      database: "integration_tests",
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

  dummyEntityType = await EntityType.create(db, {
    accountId: existingUser.accountId,
    createdById: existingUser.entityId,
    name: "Dummy",
  });
});

describe("Link model class ", () => {
  it("static isPathValid method correctly validates JSON path correctly", () => {
    expect(Link.isPathValid("$.this[0].path['should'].be[\"supported\"]")).toBe(
      true,
    );
    expect(Link.isPathValid("thispathisn'tsupported")).toBe(false);
    expect(Link.isPathValid("$.this.is.not.supported.")).toBe(false);
    expect(Link.isPathValid("$.this[*].is.not.supported")).toBe(false);
  });

  it("static parsePath method correctly parses a suppported JSON path", () => {
    expect(
      Link.parseStringifiedPath("$.this[0].path['should'].be[\"supported\"]"),
    ).toEqual(["this", 0, "path", "should", "be", "supported"]);
    expect(() =>
      Link.parseStringifiedPath("$.this[*].path.is.not.supported"),
    ).toThrow(/Cannot parse unsupported JSON path/);
  });

  it("static create method can create a link", async () => {
    const accountId = existingUser.accountId;
    const createdById = existingUser.entityId;

    const entity1 = await Entity.create(db, {
      accountId,
      createdById,
      versioned: true,
      entityTypeId: dummyEntityType.entityId,
      properties: {},
    });

    const entity2 = await Entity.create(db, {
      accountId,
      createdById,
      versioned: true,
      entityTypeId: dummyEntityType.entityId,
      properties: {},
    });

    const link = await Link.create(db, {
      stringifiedPath: "$.linkName",
      source: entity1,
      destination: entity2,
    });

    expect(link.sourceEntityId).toBe(entity1.entityId);
    expect(link.destinationEntityId).toBe(entity2.entityId);
  });

  it("static get method can retrieve a link from the datastore", async () => {
    const accountId = existingUser.accountId;
    const createdById = existingUser.entityId;

    const entity1 = await Entity.create(db, {
      accountId,
      createdById,
      versioned: true,
      entityTypeId: dummyEntityType.entityId,
      properties: {},
    });

    const entity2 = await Entity.create(db, {
      accountId,
      createdById,
      versioned: true,
      entityTypeId: dummyEntityType.entityId,
      properties: {},
    });

    const link = await Link.create(db, {
      stringifiedPath: "$.linkName",
      source: entity1,
      destination: entity2,
    });

    const retrievedLink = (await Link.get(db, {
      sourceAccountId: accountId,
      linkId: link.linkId,
    }))!;

    expect(retrievedLink).not.toBeNull();
    expect(retrievedLink.linkId).toBe(link.linkId);
    expect(retrievedLink.createdAt).toEqual(link.createdAt);
    expect(retrievedLink.sourceAccountId).toBe(link.sourceAccountId);
    expect(retrievedLink.sourceEntityId).toBe(link.sourceEntityId);
    expect(retrievedLink.sourceEntityVersionIds).toEqual(
      link.sourceEntityVersionIds,
    );
    expect(retrievedLink.destinationAccountId).toBe(link.destinationAccountId);
    expect(retrievedLink.destinationEntityId).toBe(link.destinationEntityId);
    expect(retrievedLink.destinationEntityVersionId).toBe(
      link.destinationEntityVersionId,
    );
  });

  it("can create outgoing link on non-versioned entity", async () => {
    const accountId = existingUser.accountId;
    const createdById = existingUser.entityId;

    const [sourceEntity, destinationEntity] = await Promise.all([
      Entity.create(db, {
        accountId,
        createdById,
        versioned: false,
        entityTypeId: dummyEntityType.entityId,
        properties: {},
      }),
      Entity.create(db, {
        accountId,
        createdById,
        versioned: false,
        entityTypeId: dummyEntityType.entityId,
        properties: {},
      }),
    ]);

    const intialSourceEntityId = sourceEntity.entityVersionId;

    const link = await Link.create(db, {
      stringifiedPath: "$.linkName",
      source: sourceEntity,
      destination: destinationEntity,
    });

    expect(link.sourceEntityId).toBe(sourceEntity.entityId);
    expect(Array.from(link.sourceEntityVersionIds)).toEqual([
      intialSourceEntityId,
    ]);
    expect(sourceEntity.entityVersionId).toBe(intialSourceEntityId);
  });

  it("can create and delete outgoing link on versioned source entity", async () => {
    const accountId = existingUser.accountId;
    const createdById = existingUser.entityId;

    const [versionedSourceEntity, destinationEntity] = await Promise.all([
      Entity.create(db, {
        accountId,
        createdById,
        versioned: true,
        entityTypeId: dummyEntityType.entityId,
        properties: {},
      }),
      Entity.create(db, {
        accountId,
        createdById,
        versioned: false,
        entityTypeId: dummyEntityType.entityId,
        properties: {},
      }),
    ]);

    const entityVersionIds: string[] = [versionedSourceEntity.entityVersionId];

    const link = await Link.create(db, {
      stringifiedPath: "$.linkName",
      source: versionedSourceEntity,
      destination: destinationEntity,
    });

    expect(entityVersionIds[entityVersionIds.length - 1]).not.toBe(
      versionedSourceEntity.entityVersionId,
    );

    entityVersionIds.push(versionedSourceEntity.entityVersionId);

    await link.delete(db);

    expect(entityVersionIds[entityVersionIds.length - 1]).not.toBe(
      versionedSourceEntity.entityVersionId,
    );

    entityVersionIds.push(versionedSourceEntity.entityVersionId);

    // The first version of the entity should have 0 outgoing links

    const e1 = (await Entity.getEntity(db, {
      accountId,
      entityVersionId: entityVersionIds[0],
    }))!;

    expect(e1).not.toBeNull();

    const e1OutgoingLinks = await e1.getOutgoingLinks(db);

    expect(e1OutgoingLinks.length).toBe(0);

    // The second version of the entity should have 1 outgoing link

    const e2 = (await Entity.getEntity(db, {
      accountId,
      entityVersionId: entityVersionIds[1],
    }))!;

    expect(e2).not.toBeNull();

    const e2OutgoingLinks = await e2.getOutgoingLinks(db);

    expect(e2OutgoingLinks.length).toBe(1);
    expect(e2OutgoingLinks[0].linkId).toBe(link.linkId);

    // The third version of the entity should have 0 outgoing links

    const e3 = (await Entity.getEntity(db, {
      accountId,
      entityVersionId: entityVersionIds[2],
    }))!;

    expect(e3).not.toBeNull();

    const e3OutgoingLinks = await e3.getOutgoingLinks(db);

    expect(e3OutgoingLinks.length).toBe(0);
  });
});

afterAll(async () => {
  await handler.close();
  await db.close();
});
