import "../loadTestEnv";
import { PostgresAdapter } from "@hashintel/hash-api/src/db";
import { Block, Comment, Entity, User } from "@hashintel/hash-api/src/model";
import { WayToUseHash } from "@hashintel/hash-api/src/graphql/apiTypes.gen";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { recreateDbAndRunSchemaMigrations } from "../setup";

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

let db: PostgresAdapter;

// recreating DB takes longer than the default 5 seconds.
jest.setTimeout(60000);
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
});

describe("Comment model class ", () => {
  let existingUser: User;
  let existingBlock: Block;

  beforeAll(async () => {
    existingUser = await User.createUser(db, {
      shortname: "test-user",
      preferredName: "Alice",
      emails: [{ address: "alice@hash.test", primary: true, verified: true }],
      infoProvidedAtSignup: { usingHow: WayToUseHash.ByThemselves },
    });

    const textEntity = await Entity.create(db, {
      accountId: existingUser.accountId,
      versioned: false,
      systemTypeName: "Text",
      properties: { tokens: [] },
      createdByAccountId: existingUser.accountId,
    });

    existingBlock = await Block.createBlock(db, {
      accountId: existingUser.accountId,
      properties: {
        componentId: "https://blockprotocol.org/blocks/@hash/paragraph",
      },
      blockData: textEntity,
      createdBy: existingUser,
    });
  });

  it("createComment method can create a comment", async () => {
    const comment = await Comment.createComment(db, {
      accountId: existingUser.accountId,
      parent: existingBlock,
      tokens: [],
      createdBy: existingUser,
    });

    const textTokens = await comment.getTokens(db);
    expect(textTokens.properties.tokens).toEqual([]);

    const commentOwner = await comment.getOwner(db);
    expect(commentOwner).toEqual(existingUser);

    const parentBlock = await comment.getParent(db);
    expect(parentBlock).toEqual(existingBlock);
  });
});

afterAll(async () => {
  await db.close();
});
