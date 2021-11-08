import "../loadTestEnv";
import { PostgresAdapter } from "@hashintel/hash-api/src/db";
import { Org, User } from "@hashintel/hash-api/src/model";
import { Logger } from "@hashintel/hash-backend-utils/logger";
import { IntegrationTestsHandler } from "../setup";
import { WayToUseHash } from "../../graphql/apiTypes.gen";

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

let handler: IntegrationTestsHandler;

let db: PostgresAdapter;

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
});

describe("Org model class ", () => {
  let orgMember1: User;
  let orgMember2: User;
  let org: Org;

  beforeAll(async () => {
    [orgMember1, orgMember2] = await Promise.all([
      User.createUser(db, {
        shortname: "test-user-1",
        preferredName: "Alice",
        emails: [{ address: "alice@hash.test", primary: true, verified: true }],
        memberOf: [],
        infoProvidedAtSignup: { usingHow: WayToUseHash.ByThemselves },
      }),
      User.createUser(db, {
        shortname: "test-user-2",
        preferredName: "Bob",
        emails: [{ address: "bob@hash.test", primary: true, verified: true }],
        memberOf: [],
        infoProvidedAtSignup: { usingHow: WayToUseHash.ByThemselves },
      }),
    ]);

    org = await Org.createOrg(db, {
      createdById: orgMember1.entityId,
      properties: {
        shortname: "bigco",
        name: "Big Company",
        memberships: [],
      },
    });

    await orgMember1.joinOrg(db, { org, responsibility: "Developer" });
    await orgMember2.joinOrg(db, { org, responsibility: "Developer" });
  });

  it("getOrgMemberships method returns orgMemberships", async () => {
    const orgMemberships = await org.getOrgMemberships(db);

    expect(orgMemberships.length).toBe(2);
  });

  it("getOrgMembers method returns all users that are a member of the organization", async () => {
    const orgMembers = await org.getOrgMembers(db);

    expect(orgMembers.length).toBe(2);
    expect(
      orgMembers.find(({ entityId }) => entityId === orgMember1.entityId),
    ).not.toBeUndefined();
    expect(
      orgMembers.find(({ entityId }) => entityId === orgMember2.entityId),
    ).not.toBeUndefined();
  });
});

afterAll(async () => {
  await handler.close();
  await db.close();
});
