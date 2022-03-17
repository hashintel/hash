import "../loadTestEnv";
import { PostgresAdapter } from "@hashintel/hash-api/src/db";
import { Entity, EntityType, User } from "@hashintel/hash-api/src/model";
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

const createEntity = () =>
  Entity.create(db, {
    entityTypeId: dummyEntityType.entityId,
    properties: {},
    accountId: existingUser.accountId,
    createdByAccountId: existingUser.accountId,
    versioned: false,
  });

describe("Entity model class ", () => {
  let entityA: Entity;
  let entityB: Entity;

  beforeAll(async () => {
    [entityA, entityB] = await Promise.all([createEntity(), createEntity()]);

    await entityA.createOutgoingLink(db, {
      destination: entityB,
      stringifiedPath: "$.linkFromAToB1",
      createdByAccountId: existingUser.accountId,
    });

    await entityA.createOutgoingLink(db, {
      destination: entityB,
      stringifiedPath: "$.linkFromAToB2",
      createdByAccountId: existingUser.accountId,
    });
  });

  it("can get outgoing links", async () => {
    const outgoingLinks = await entityA.getOutgoingLinks(db);

    expect(outgoingLinks).toHaveLength(2);

    const outgoingLink1 = outgoingLinks.find(
      ({ stringifiedPath }) => stringifiedPath === "$.linkFromAToB1",
    );

    expect(outgoingLink1).toBeDefined();

    const outgoingLink2 = outgoingLinks.find(
      ({ stringifiedPath }) => stringifiedPath === "$.linkFromAToB2",
    );

    expect(outgoingLink2).toBeDefined();
  });

  it("can get incoming links", async () => {
    const incomingLinks = await entityB.getIncomingLinks(db);

    expect(incomingLinks).toHaveLength(2);

    const incomingLink1 = incomingLinks.find(
      ({ stringifiedPath }) => stringifiedPath === "$.linkFromAToB1",
    );

    expect(incomingLink1).toBeDefined();

    const incomingLink2 = incomingLinks.find(
      ({ stringifiedPath }) => stringifiedPath === "$.linkFromAToB2",
    );

    expect(incomingLink2).toBeDefined();
  });
});

afterAll(async () => {
  await db.close();
});
