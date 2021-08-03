import { ApiClient } from "./util";
import { IntegrationTestsHandler } from "./setup";

const ACCOUNT_ID = "00fbb02c-52ee-45bb-b0aa-39c5d44f216e";

const client = new ApiClient("http://localhost:5001/graphql");

let handler: IntegrationTestsHandler;

beforeAll(async () => {
  handler = new IntegrationTestsHandler();
  await handler.init();
  await handler.createAccount(ACCOUNT_ID);
});

afterAll(async () => {
  await handler.close();
});

it("can create user", async () => {
  const userVars = {
    email: "alice@bigco.com",
    shortname: "alice",
  };
  const res = await client.createUser(userVars);

  expect(res.properties).toEqual(userVars);
  expect(res.createdAt).toEqual(res.updatedAt);
  expect(res.type).toEqual("User");
});

it("can create org", async () => {
  const orgVars = {
    shortname: "bigco",
  };
  const res = await client.createOrg(orgVars);
  expect(res.properties).toEqual(orgVars);
  expect(res.createdAt).toEqual(res.updatedAt);
  expect(res.type).toEqual("Org");
});

it("can create page", async () => {
  const page = await client.createPage({
    accountId: ACCOUNT_ID,
    properties: {
      title: "My first page",
    },
  });

  const updatedPage = await client.insertBlocksIntoPage({
    accountId: ACCOUNT_ID,
    pageId: page.id,
    blocks: [
      {
        accountId: ACCOUNT_ID,
        componentId: "https://block.blockprotocol.org/header",
        entityType: "Text",
        entityProperties: {
          texts: [{ text: "Hello World!" }],
        },
      },
    ],
  });

  expect(updatedPage.metadataId).toEqual(page.metadataId);
  expect(updatedPage.id).not.toEqual(page.id); // new version
  expect(updatedPage.history).toHaveLength(2);
  expect(updatedPage.history).toEqual([
    { createdAt: updatedPage.createdAt, entityId: updatedPage.id },
    { createdAt: page.createdAt, entityId: page.id },
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
