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

    const entityAV1Timestamp = new Date();

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

    const entityAV1OutgoingLinks = await entityA.getOutgoingLinks(db, {
      activeAt: entityAV1Timestamp,
    });

    expect(entityAV1OutgoingLinks).toHaveLength(0);

    const entityAV2OutgoingLinks = await entityA.getOutgoingLinks(db);

    expect(entityAV2OutgoingLinks).toHaveLength(1);
    expect(entityAV2OutgoingLinks[0]).toEqual(link);
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

    expect(retrievedLink.appliedToSourceAt).toEqual(link.appliedToSourceAt);

    expect(retrievedLink.sourceAccountId).toBe(link.sourceAccountId);
    expect(retrievedLink.sourceEntityId).toBe(link.sourceEntityId);
    expect(retrievedLink.destinationAccountId).toBe(link.destinationAccountId);
    expect(retrievedLink.destinationEntityId).toBe(link.destinationEntityId);
    expect(retrievedLink.destinationEntityVersionId).toBe(
      link.destinationEntityVersionId,
    );
  });

  it("static create/delete methods can create/delete indexed links on versioned source entity", async () => {
    const accountId = existingUser.accountId;
    const createdByAccountId = accountId;

    const stringifiedPath = "$.indexedLink";

    const entityA = await Entity.create(db, {
      accountId,
      createdByAccountId,
      versioned: true,
      entityTypeId: dummyEntityType.entityId,
      properties: {},
    });

    const entityATimestamp1 = new Date();

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
      stringifiedPath,
      index: 0,
    });

    const entityATimestamp2 = new Date();

    const linkAToC = await Link.create(db, {
      createdByAccountId,
      source: entityA,
      destination: entityC,
      stringifiedPath,
      index: 0,
    });

    const entityATimestamp3 = new Date();

    await entityA.deleteOutgoingLink(db, {
      linkId: linkAToC.linkId,
      deletedByAccountId: accountId,
    });

    const entityATimestamp4 = new Date();

    const entityATimestamp1OutgoingLinks = await entityA.getOutgoingLinks(db, {
      activeAt: entityATimestamp1,
      stringifiedPath,
    });

    expect(entityATimestamp1OutgoingLinks.length).toBe(0);

    const entityATimestamp2OutgoingLinks = await entityA.getOutgoingLinks(db, {
      activeAt: entityATimestamp2,
      stringifiedPath,
    });

    expect(entityATimestamp2OutgoingLinks.length).toBe(1);
    expect(entityATimestamp2OutgoingLinks[0]!.linkId).toBe(linkAToB.linkId);
    expect(entityATimestamp2OutgoingLinks[0]!.index).toBe(0);

    const entityATimestamp3OutgoingLinks = await entityA.getOutgoingLinks(db, {
      activeAt: entityATimestamp3,
      stringifiedPath,
    });

    expect(entityATimestamp3OutgoingLinks.length).toBe(2);
    expect(entityATimestamp3OutgoingLinks[0]!.linkId).toBe(linkAToC.linkId);
    expect(entityATimestamp3OutgoingLinks[0]!.index).toBe(0);

    expect(entityATimestamp3OutgoingLinks[1]!.linkId).toBe(linkAToB.linkId);
    expect(entityATimestamp3OutgoingLinks[1]!.sourceEntityId).toBe(
      linkAToB.sourceEntityId,
    );
    expect(entityATimestamp3OutgoingLinks[1]!.destinationEntityId).toBe(
      linkAToB.destinationEntityId,
    );
    expect(entityATimestamp3OutgoingLinks[1]!.destinationEntityVersionId).toBe(
      linkAToB.destinationEntityVersionId,
    );
    expect(entityATimestamp3OutgoingLinks[1]!.index).toBe(1);

    const entityATimestamp4OutgoingLinks = await entityA.getOutgoingLinks(db, {
      activeAt: entityATimestamp4,
    });

    expect(entityATimestamp4OutgoingLinks.length).toBe(1);

    expect(entityATimestamp4OutgoingLinks[0]!.sourceEntityId).toBe(
      entityA.entityId,
    );
    expect(entityATimestamp4OutgoingLinks[0]!.destinationEntityId).toBe(
      entityB.entityId,
    );
    expect(entityATimestamp4OutgoingLinks[0]!.index).toBe(0);
  });
});

afterAll(async () => {
  await db.close();
});
