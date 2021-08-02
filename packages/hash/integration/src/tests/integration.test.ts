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

test("can create user", async () => {
  const userVars = {
    email: "alice@bigco.com",
    shortname: "alice",
  };
  const res = await client.createUser(userVars);

  expect(res.properties).toEqual(userVars);
  expect(res.createdAt).toEqual(res.updatedAt);
  expect(res.type).toEqual("User");
});

test("can create org", async () => {
  const orgVars = {
    shortname: "bigco",
  };
  const res = await client.createOrg(orgVars);
  expect(res.properties).toEqual(orgVars);
  expect(res.createdAt).toEqual(res.updatedAt);
  expect(res.type).toEqual("Org");
});
