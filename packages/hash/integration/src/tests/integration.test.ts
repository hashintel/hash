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

    it("can update the page", async () => {
      const updatedPage = await client.insertBlocksIntoPage({
        accountId: testLoggedInUser.accountId,
        pageId: page.entityVersionId,
        pageMetadataId: page.metadataId,
        blocks: [
          {
            accountId: testLoggedInUser.accountId,
            componentId: "https://block.blockprotocol.org/header",
            systemTypeName: SystemTypeName.Text,
            entityProperties: {
              texts: [{ text: "Hello World!" }],
            },
          },
        ],
      });

      expect(updatedPage.metadataId).toEqual(page.metadataId);
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
    });

    // @todo: we changed the behavior of GraphQL updates to perform the update on the
    // latest version, even if the ID passed does not match that of the latest version.
    // The test below expects an error on such cases. Return here when the question of
    // optimistic vs. strict entity updates is resolved.
    // it("should throw when updating non-latest version of a page", async () => {
    //   expect.assertions(1);
    //   await expect(
    //     client.insertBlocksIntoPage({
    //       accountId: ACCOUNT_ID,
    //       pageId: page.id,
    //       pageMetadataId: page.metadataId,
    //       blocks: [
    //         {
    //           accountId: ACCOUNT_ID,
    //           componentId: "https://block.blockprotocol.org/header",
    //           entityType: "Text",
    //           entityProperties: {
    //             texts: [{ text: "This will fail" }],
    //           },
    //         },
    //       ],
    //     })
    //   ).rejects.toThrow();
    // });
  });
});
