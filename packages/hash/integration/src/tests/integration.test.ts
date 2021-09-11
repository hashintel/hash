import "./loadTestEnv";
import { User, VerificationCode } from "@hashintel/hash-backend/src/model";
import { PostgresAdapter } from "@hashintel/hash-backend/src/db";

import { ApiClient } from "./util";
import { IntegrationTestsHandler } from "./setup";
import { PageFieldsFragment, SystemTypeName } from "../graphql/apiTypes.gen";

const client = new ApiClient("http://localhost:5001/graphql");

let handler: IntegrationTestsHandler;

let db: PostgresAdapter;

beforeAll(async () => {
  handler = new IntegrationTestsHandler();
  await handler.init();

  db = new PostgresAdapter({
    host: "localhost",
    user: "postgres",
    port: 5432,
    database: "integration_tests",
    password: "postgres",
  });
});

afterAll(async () => {
  await handler.close();
  await db.close();
});

it("can create user", async () => {
  const email = "alice@bigco.com";

  const { id: verificationCodeId, createdAt: verificationCodeCreatedAt } =
    await client.createUser({ email });

  const user = (await User.getUserByEmail(db)({
    email,
    verified: false,
    primary: true,
  }))!;

  expect(user).not.toBeNull();
  expect(user.properties).toEqual({
    emails: [{ address: email, primary: true, verified: false }],
  });
  expect(user.entityCreatedAt).toEqual(user.entityVersionUpdatedAt);
  expect(user.entityType.properties.title).toEqual("User");

  const verificationCode = (await VerificationCode.getById(db)({
    id: verificationCodeId,
  }))!;

  expect(verificationCode).not.toBeNull();
  expect(verificationCode.createdAt.toISOString()).toBe(
    verificationCodeCreatedAt
  );

  /** @todo: check whether the verification code was sent to the email address */
});

const SHORTNAME = "test-user";
const PREFERRED_NAME = "Alice";
const PRIMARY_EMAIL = "test@gmail.com";

/** @todo: integration tests for login and signup mutations */

describe("logged in", () => {
  let testLoggedInUser: User;

  beforeAll(async () => {
    testLoggedInUser = await User.createUser(db)({
      shortname: SHORTNAME,
      preferredName: PREFERRED_NAME,
      emails: [{ address: PRIMARY_EMAIL, primary: true, verified: true }],
    });

    const { id: verificationId } = await client.sendLoginCode({
      emailOrShortname: PRIMARY_EMAIL,
    });

    const verificationCode = await VerificationCode.getById(db)({
      id: verificationId,
    });

    if (!verificationCode) {
      throw new Error("verification code not found in datastore");
    }

    const { responseHeaders } = await client.loginWithLoginCode({
      verificationCode: verificationCode.code,
      verificationId,
    });

    const setCookieValue = responseHeaders.get("set-cookie");

    if (!setCookieValue) {
      throw new Error(`'set-cookie' field was not found in response header`);
    }

    const cookie = setCookieValue.split(";")[0];

    client.setCookie(cookie);
  });

  afterAll(async () => {
    /** @todo: delete test user from db */
    client.removeCookie();
  });

  it("can create org", async () => {
    const orgVars = {
      shortname: "bigco",
    };
    const res = await client.createOrg(orgVars);
    expect(res.properties).toEqual(orgVars);
    expect(res.createdAt).toEqual(res.updatedAt);
    expect(res.entityTypeName).toEqual("Org");
  });

  describe("create and update pages", () => {
    let page: PageFieldsFragment;
    it("can create a page", async () => {
      page = await client.createPage({
        accountId: testLoggedInUser.accountId,
        properties: {
          title: "My first page",
        },
      });
      return page;
    });

    let textEntityId: string;
    it("can add a block to the page", async () => {
      const textProperties = { texts: [{ text: "Hello World!" }] };
      const updatedPage = await client.insertBlocksIntoPage({
        accountId: testLoggedInUser.accountId,
        entityId: page.entityId,
        entityVersionId: page.entityVersionId,
        blocks: [
          {
            accountId: testLoggedInUser.accountId,
            componentId: "https://block.blockprotocol.org/header",
            systemTypeName: SystemTypeName.Text,
            entityProperties: textProperties,
          },
        ],
      });

      expect(updatedPage.entityId).toEqual(page.entityId);
      expect(updatedPage.entityVersionId).not.toEqual(page.entityVersionId); // new version
      expect(updatedPage.history).toHaveLength(2);
      expect(updatedPage.history).toEqual([
        {
          createdAt: updatedPage.createdAt,
          entityId: updatedPage.entityVersionId,
        },
        { createdAt: page.createdAt, entityId: page.entityVersionId },
      ]);
      expect(updatedPage.properties.title).toEqual("My first page");

      // We inserted a block at the beginning of the page. The remaining blocks should
      // be the same.
      expect(updatedPage.properties.contents.length).toEqual(
        page.properties.contents.length + 1
      );
      expect(updatedPage.properties.contents.slice(1)).toEqual(
        page.properties.contents
      );

      // Get the text entity we just inserted and make sure it matches
      const newBlock = updatedPage.properties.contents[0];
      textEntityId = newBlock.properties.entity.metadataId;
      const textEntity = await client.getUnknownEntity({
        entityId: textEntityId,
        accountId: testLoggedInUser.accountId,
      });
      expect(textEntity.entityVersionId).toEqual(newBlock.properties.entity.id);
      expect(textEntity.properties).toEqual(textProperties);
    });

    it("should create a new page version when a block is updated", async () => {
      // Update the text block inside the page
      const newTextProperties = { texts: [{ text: "Hello HASH!" }] };
      const { entityVersionId, entityId } = await client.updateEntity({
        accountId: testLoggedInUser.accountId,
        entityId: textEntityId,
        properties: newTextProperties,
      });
      expect(textEntityId).toEqual(entityId);

      // Check that the text update succeeded
      const newTextEntity = await client.getUnknownEntity({
        accountId: testLoggedInUser.accountId,
        entityVersionId,
      });
      expect(newTextEntity.properties).toEqual(newTextProperties);

      // Check that the updated version of the page references the latest version of the
      // text entity.
      let updatedPage = await client.getPage({
        accountId: testLoggedInUser.accountId,
        entityId: page.entityId,
      });
      expect(updatedPage.history!).toHaveLength(3);
      expect(updatedPage.properties.contents[0].properties.entity.id).toEqual(
        newTextEntity.entityVersionId
      );

      // Update the header block text entity (2nd block)
      const newHeaderTextProperties = { texts: [{ text: "Header Text" }] };
      const headerBlock = updatedPage.properties.contents[1];
      const headerUpdate = await client.updateEntity({
        accountId: testLoggedInUser.accountId,
        entityId: headerBlock.properties.entity.metadataId,
        properties: newHeaderTextProperties,
      });

      // Check that the page is up-to-date
      updatedPage = await client.getPage({
        accountId: testLoggedInUser.accountId,
        entityId: page.entityId,
      });
      expect(updatedPage.history!).toHaveLength(4);
      expect(updatedPage.properties.contents[1].properties.entity.id).toEqual(
        headerUpdate.entityVersionId
      );
    });
  });
});
