import "../loadTestEnv";
import { PostgresAdapter } from "@hashintel/hash-api/src/db";
import { Entity, EntityType, Link, User } from "@hashintel/hash-api/src/model";
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

  dummyEntityType = await EntityType.create(db, {
    accountId: existingUser.accountId,
    createdByAccountId: existingUser.entityId,
    name: "Dummy",
  });
});

describe("Link model class ", () => {
  it("static isPathValid method correctly validates JSON path", () => {
    expect(Link.isPathValid("$.this.path.should.be.supported")).toBe(true);
    expect(
      Link.isPathValid("$.this.path['should'].not.be[\"supported\"]"),
    ).toBe(false);
    expect(Link.isPathValid("$.this.path.is.not.supported[0]")).toBe(false);
    expect(Link.isPathValid("$")).toBe(false);
    expect(Link.isPathValid("$.")).toBe(false);
    expect(Link.isPathValid("thispathisn'tsupported")).toBe(false);
    expect(Link.isPathValid("$.this.is.not.supported.")).toBe(false);
    expect(Link.isPathValid("$.this[*].is.not.supported")).toBe(false);
  });

  it("static parsePath method correctly parses a suppported JSON path", () => {
    expect(
      Link.parseStringifiedPath("$.this.path.should.be.supported"),
    ).toEqual(["this", "path", "should", "be", "supported"]);
    expect(() =>
      Link.parseStringifiedPath("$.this[*].path.is.not.supported"),
    ).toThrow(/Cannot parse unsupported JSON path/);
  });

  it("static create method can create a link", async () => {
    const accountId = existingUser.accountId;
    const createdByAccountId = accountId;

    const entity1 = await Entity.create(db, {
      accountId,
      createdByAccountId,
      versioned: false,
      entityTypeId: dummyEntityType.entityId,
      properties: {},
    });

    const entity2 = await Entity.create(db, {
      accountId,
      createdByAccountId,
      versioned: false,
      entityTypeId: dummyEntityType.entityId,
      properties: {},
    });

    const link = await Link.create(db, {
      createdByAccountId,
      stringifiedPath: "$.linkName",
      source: entity1,
      destination: entity2,
    });

    expect(link.sourceEntityId).toBe(entity1.entityId);
    expect(link.destinationEntityId).toBe(entity2.entityId);
  });

  it("static create method can create a link on a versioned source entity", async () => {
    const accountId = existingUser.accountId;
    const createdByAccountId = accountId;

    const entityA = await Entity.create(db, {
      accountId,
      createdByAccountId,
      versioned: true,
      entityTypeId: dummyEntityType.entityId,
      properties: {},
    });

    const entityAVersionId1 = entityA.entityVersionId;

    const entityB = await Entity.create(db, {
      accountId,
      createdByAccountId,
      versioned: false,
      entityTypeId: dummyEntityType.entityId,
      properties: {},
    });

    const link = await Link.create(db, {
      createdByAccountId,
      stringifiedPath: "$.linkName",
      source: entityA,
      destination: entityB,
    });

    await entityA.refetchLatestVersion(db);

    const entityAVersionId2 = entityA.entityVersionId;

    expect(entityAVersionId1).not.toBe(entityAVersionId2);

    const entityAVersion1 = (await Entity.getEntity(db, {
      accountId: entityA.accountId,
      entityVersionId: entityAVersionId1,
    }))!;

    expect(entityAVersion1).not.toBe(null);

    const entityAVersionId1OutgoingLinks =
      await entityAVersion1.getOutgoingLinks(db);

    expect(entityAVersionId1OutgoingLinks).toHaveLength(0);

    const entityAVersion2 = (await Entity.getEntity(db, {
      accountId: entityA.accountId,
      entityVersionId: entityAVersionId2,
    }))!;

    expect(entityAVersion1).not.toBe(null);

    const entityAVersionId2OutgoingLinks =
      await entityAVersion2.getOutgoingLinks(db);

    expect(entityAVersionId2OutgoingLinks).toHaveLength(1);
    expect(entityAVersionId2OutgoingLinks[0]).toEqual(link);
  });

  it("static get method can retrieve a link from the datastore", async () => {
    const accountId = existingUser.accountId;
    const createdByAccountId = accountId;

    const entity1 = await Entity.create(db, {
      accountId,
      createdByAccountId,
      versioned: true,
      entityTypeId: dummyEntityType.entityId,
      properties: {},
    });

    const entity2 = await Entity.create(db, {
      accountId,
      createdByAccountId,
      versioned: true,
      entityTypeId: dummyEntityType.entityId,
      properties: {},
    });

    const link = await Link.create(db, {
      createdByAccountId,
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

  it("static create/delete methods can create/delete indexed links on versioned source entity", async () => {
    const accountId = existingUser.accountId;
    const createdByAccountId = accountId;

    const entityA = await Entity.create(db, {
      accountId,
      createdByAccountId,
      versioned: true,
      entityTypeId: dummyEntityType.entityId,
      properties: {},
    });

    const entityAVersionId1 = entityA.entityVersionId;

    const [entityB, entityC] = await Promise.all([
      Entity.create(db, {
        accountId,
        createdByAccountId,
        versioned: false,
        entityTypeId: dummyEntityType.entityId,
        properties: {},
      }),
      Entity.create(db, {
        accountId,
        createdByAccountId,
        versioned: false,
        entityTypeId: dummyEntityType.entityId,
        properties: {},
      }),
    ]);

    const linkAToB = await Link.create(db, {
      createdByAccountId,
      source: entityA,
      destination: entityB,
      stringifiedPath: "$.test",
      index: 0,
    });

    await entityA.refetchLatestVersion(db);

    const entityAVersionId2 = entityA.entityVersionId;

    expect(entityAVersionId1).not.toBe(entityAVersionId2);

    const linkAToC = await Link.create(db, {
      createdByAccountId,
      source: entityA,
      destination: entityC,
      stringifiedPath: "$.test",
      index: 0,
    });

    await entityA.refetchLatestVersion(db);

    const entityAVersionId3 = entityA.entityVersionId;

    expect(entityAVersionId2).not.toBe(entityAVersionId3);

    await entityA.deleteOutgoingLink(db, {
      linkId: linkAToC.linkId,
      deletedByAccountId: accountId,
    });

    const entityAVersionId4 = entityA.entityVersionId;

    expect(entityAVersionId3).not.toBe(entityAVersionId4);

    const entityAVersion1 = (await Entity.getEntity(db, {
      accountId,
      entityVersionId: entityAVersionId1,
    }))!;

    expect(entityAVersion1).not.toBe(null);

    const entityAVersion1OutgoingLinks = await entityAVersion1.getOutgoingLinks(
      db,
    );

    expect(entityAVersion1OutgoingLinks.length).toBe(0);

    const entityAVersion2 = (await Entity.getEntity(db, {
      accountId,
      entityVersionId: entityAVersionId2,
    }))!;

    expect(entityAVersion2).not.toBe(null);

    const entityAVersion2OutgoingLinks = await entityAVersion2.getOutgoingLinks(
      db,
    );

    expect(entityAVersion2OutgoingLinks.length).toBe(1);
    expect(entityAVersion2OutgoingLinks[0].linkId).toBe(linkAToB.linkId);
    expect(entityAVersion2OutgoingLinks[0].index).toBe(0);

    const entityAVersion3 = (await Entity.getEntity(db, {
      accountId,
      entityVersionId: entityAVersionId3,
    }))!;

    expect(entityAVersion3).not.toBe(null);

    const entityAVersion3OutgoingLinks = await entityAVersion3.getOutgoingLinks(
      db,
    );

    expect(entityAVersion3OutgoingLinks.length).toBe(2);
    expect(entityAVersion3OutgoingLinks[0].linkId).toBe(linkAToC.linkId);
    expect(entityAVersion3OutgoingLinks[0].index).toBe(0);

    expect(entityAVersion3OutgoingLinks[1].linkId).not.toBe(linkAToB.linkId);
    expect(entityAVersion3OutgoingLinks[1].sourceEntityId).toBe(
      linkAToB.sourceEntityId,
    );
    expect(entityAVersion3OutgoingLinks[1].destinationEntityId).toBe(
      linkAToB.destinationEntityId,
    );
    expect(entityAVersion3OutgoingLinks[1].destinationEntityVersionId).toBe(
      linkAToB.destinationEntityVersionId,
    );
    expect(entityAVersion3OutgoingLinks[1].index).toBe(1);

    const entityAVersion4 = (await Entity.getEntity(db, {
      accountId,
      entityVersionId: entityAVersionId4,
    }))!;

    expect(entityAVersion4).not.toBe(null);

    const entityAVersion4OutgoingLinks = await entityAVersion4.getOutgoingLinks(
      db,
    );

    expect(entityAVersion4OutgoingLinks.length).toBe(1);

    expect(entityAVersion4OutgoingLinks[0].sourceEntityId).toBe(
      entityA.entityId,
    );
    expect(entityAVersion4OutgoingLinks[0].destinationEntityId).toBe(
      entityB.entityId,
    );
    expect(entityAVersion4OutgoingLinks[0].index).toBe(0);
  });
});

afterAll(async () => {
  await db.close();
});
