import "../loadTestEnv";
import { PostgresAdapter } from "@hashintel/hash-api/src/db";
import { Entity, EntityType, User } from "@hashintel/hash-api/src/model";
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

describe("Entity model class ", () => {
  // describe("representing a non-versioned entity ", async () => {

  // })

  describe("representing a versioned entity ", () => {
    it("createOutgoingLink method creates a link", async () => {
      const accountId = existingUser.accountId;
      const createdById = existingUser.entityId;

      const entityA = await Entity.create(db, {
        accountId,
        createdById,
        versioned: true,
        entityTypeId: dummyEntityType.entityId,
        properties: {},
      });

      const entityAVersionId1 = entityA.entityVersionId;

      const [entityB, entityC] = await Promise.all([
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
          versioned: true,
          entityTypeId: dummyEntityType.entityId,
          properties: {},
        }),
      ]);

      const linkAToB = await entityA.createOutgoingLink(db, {
        destination: entityB,
        stringifiedPath: "$.test",
        index: 0,
      });

      const entityAVersionId2 = entityA.entityVersionId;

      expect(entityAVersionId1).not.toBe(entityAVersionId2);

      const linkAToC = await entityA.createOutgoingLink(db, {
        destination: entityC,
        stringifiedPath: "$.test",
        index: 0,
      });

      const entityAVersionId3 = entityA.entityVersionId;

      expect(entityAVersionId2).not.toBe(entityAVersionId3);

      await entityA.deleteOutgoingLink(db, linkAToC);

      const entityAVersionId4 = entityA.entityVersionId;

      expect(entityAVersionId3).not.toBe(entityAVersionId4);

      const entityAVersion1 = (await Entity.getEntity(db, {
        accountId,
        entityVersionId: entityAVersionId1,
      }))!;

      expect(entityAVersion1).not.toBe(null);

      const entityAVersion1OutgoingLinks =
        await entityAVersion1.getOutgoingLinks(db);

      expect(entityAVersion1OutgoingLinks.length).toBe(0);

      const entityAVersion2 = (await Entity.getEntity(db, {
        accountId,
        entityVersionId: entityAVersionId2,
      }))!;

      expect(entityAVersion2).not.toBe(null);

      const entityAVersion2OutgoingLinks =
        await entityAVersion2.getOutgoingLinks(db);

      expect(entityAVersion2OutgoingLinks.length).toBe(1);
      expect(entityAVersion2OutgoingLinks[0].linkId).toBe(linkAToB.linkId);
      expect(entityAVersion2OutgoingLinks[0].index).toBe(0);

      const entityAVersion3 = (await Entity.getEntity(db, {
        accountId,
        entityVersionId: entityAVersionId3,
      }))!;

      expect(entityAVersion3).not.toBe(null);

      const entityAVersion3OutgoingLinks =
        await entityAVersion3.getOutgoingLinks(db);

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

      const entityAVersion4OutgoingLinks =
        await entityAVersion4.getOutgoingLinks(db);

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
});

afterAll(async () => {
  await handler.close();
  await db.close();
});
