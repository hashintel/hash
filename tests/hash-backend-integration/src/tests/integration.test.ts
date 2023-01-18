/**
 * @todo: re-implement integration tests on the GraphQL layer
 * @see https://app.asana.com/0/1202805690238892/1203084714149810/f
 */
/* eslint-disable */
// @ts-nocheck

import "./load-test-env";
import {
  Aggregation,
  Entity,
  EntityType,
  Org,
  OrgEmailInvitation,
  User,
  VerificationCode,
} from "@hashintel/hash-api/src/model";
import { PostgresAdapter } from "@hashintel/hash-api/src/db";
import { DummyEmailTransporter } from "@hashintel/hash-api/src/email/transporters";
import { Logger } from "@local/hash-backend-utils/logger";
import { treeFromParentReferences } from "@hashintel/hash-api/src/util";

import { ClientError } from "graphql-request";
import { ApiClient } from "./util";
import { recreateDbAndRunSchemaMigrations } from "./setup";
import {
  CreateOrgMutationVariables,
  OrgInvitationLinkProperties,
  OrgSize,
  PageFieldsFragment,
  SystemTypeName,
  WayToUseHash,
  DeprecatedEntityType,
} from "../graphql/api-types.gen";

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const client = new ApiClient("http://localhost:5001/graphql");

let bobCounter = 0;

let db: PostgresAdapter;

// Note that emailTransporter does not have access to all email in this test suite.
// When API Client is used, a real API server is involved and it has its own transporter.
let emailTransporter: DummyEmailTransporter;

let existingUser: User;

let existingOrg: Org;

const createEntity = (params: { entityTypeId: string }) =>
  Entity.create(db, {
    ...params,
    accountId: existingUser.accountId,
    createdByAccountId: existingUser.entityId,
    versioned: false,
    properties: {},
  });

let entityTypeCounter = 0;

const createEntityType = async () => {
  entityTypeCounter += 1;
  return EntityType.create(db, {
    accountId: existingUser.accountId,
    createdByAccountId: existingUser.entityId,
    name: `Dummy-${entityTypeCounter}`,
  });
};

const createNewBobWithOrg = async () => {
  const bobUser = await User.createUser(db, {
    shortname: `bob-${bobCounter}`,
    preferredName: `Bob-${bobCounter}`,
    emails: [
      {
        address: `bob-${bobCounter}@hash.test`,
        primary: true,
        verified: true,
      },
    ],
    infoProvidedAtSignup: { usingHow: WayToUseHash.WithATeam },
  });

  bobCounter += 1;

  const bobOrg = await Org.createOrg(db, {
    createdByAccountId: bobUser.entityId,
    properties: {
      shortname: `${bobUser.properties.shortname!}-org`,
      name: `${bobUser.properties.preferredName!}'s Org`,
    },
  });

  await bobUser.joinOrg(db, {
    updatedByAccountId: bobUser.accountId,
    org: bobOrg,
    responsibility: "CEO",
  });

  return { bobUser, bobOrg };
};

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

  emailTransporter = new DummyEmailTransporter();

  existingUser = await User.createUser(db, {
    shortname: "test-user",
    preferredName: "Alice",
    emails: [{ address: "alice@hash.test", primary: true, verified: true }],
    infoProvidedAtSignup: { usingHow: WayToUseHash.ByThemselves },
  });

  existingOrg = await Org.createOrg(db, {
    createdByAccountId: existingUser.entityId,
    properties: {
      shortname: "bigco",
      name: "Big Company",
    },
  });

  await existingUser.joinOrg(db, {
    updatedByAccountId: existingUser.accountId,
    org: existingOrg,
    responsibility: "CEO",
  });
});

afterAll(async () => {
  await db.close();
});

it("can create user", async () => {
  const email = `bob-${bobCounter}@hash.test`;

  bobCounter += 1;

  const { id: verificationCodeId, createdAt: verificationCodeCreatedAt } =
    await client.createUser({ email });

  const user = (await User.getUserByEmail(db, {
    email,
    verified: false,
    primary: true,
  }))!;

  expect(user).not.toBeNull();
  expect(user.properties.emails).toEqual([
    { address: email, primary: true, verified: false },
  ]);
  expect(user.createdAt).toEqual(user.updatedAt);
  expect(user.entityType.properties.title).toEqual("User");

  /** @todo: check whether the verification code was sent to the email address */
  const verificationCode = (await VerificationCode.getById(db, {
    id: verificationCodeId,
  }))!;

  expect(verificationCode).not.toBeNull();
  expect(verificationCode.createdAt.toISOString()).toBe(
    verificationCodeCreatedAt,
  );

  /** @todo: cleanup created user in datastore */
});

it("can create user with email verification code", async () => {
  const inviteeEmailAddress = "david@hash.test";

  await OrgEmailInvitation.createOrgEmailInvitation(db, emailTransporter, {
    org: existingOrg,
    inviter: existingUser,
    inviteeEmailAddress,
  });

  const { invitationLinkToken } = emailTransporter.getMostRecentEmail({
    assertDerivedPayloadType: "orgInvitation",
  }).derivedPayload;

  const { entityId, accountSignupComplete } =
    await client.createUserWithOrgEmailInvitation({
      orgEntityId: existingOrg.entityId,
      invitationEmailToken: invitationLinkToken,
    });

  expect(accountSignupComplete).toEqual(false);

  const user = (await User.getUserById(db, { entityId }))!;

  expect(user).not.toBeNull();
  expect(user.getPrimaryEmail()).toEqual({
    address: inviteeEmailAddress,
    verified: true,
    primary: true,
  });
});

describe("can log in", () => {
  let verificationCode: VerificationCode;

  it("can send login code", async () => {
    const { address: emailAddress } = existingUser.getPrimaryEmail();

    const { id: verificationId } = await client.sendLoginCode({
      emailOrShortname: emailAddress,
    });

    const verificationCodeOrNull = await VerificationCode.getById(db, {
      id: verificationId,
    });

    expect(verificationCodeOrNull).not.toBeNull();

    verificationCode = verificationCodeOrNull!;

    expect(verificationCode.emailAddress).toBe(emailAddress);
  });

  it("can login with login code", async () => {
    const { user, responseHeaders } = await client.loginWithLoginCode({
      verificationCode: verificationCode.code,
      verificationId: verificationCode.id,
    });

    expect(user.entityId).toBe(existingUser.entityId);
    expect(typeof responseHeaders.get("set-cookie")).toBe("string");
  });
});

/** @todo: integration tests for login and signup mutations */

describe("logged in user ", () => {
  beforeAll(async () => {
    const { id: verificationId } = await client.sendLoginCode({
      emailOrShortname: existingUser.getPrimaryEmail().address,
    });

    const verificationCode = await VerificationCode.getById(db, {
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

    const cookie = setCookieValue.split(";")[0]!;

    client.setCookie(cookie);
  });

  afterAll(() => {
    /** @todo: delete test user from db */
    client.removeCookie();
  });

  it("can create org", async () => {
    const variables: CreateOrgMutationVariables = {
      org: {
        name: "Second Big Company",
        shortname: "bigco2",
        orgSize: OrgSize.TwoHundredAndFiftyPlus,
      },
      responsibility: "CEO",
    };

    const gqlOrg = await client.createOrg(variables);

    const org = (await Org.getOrgById(db, gqlOrg))!;

    // Test the org has been created correctly
    expect(org).not.toBeNull();
    expect(org.properties.name).toEqual(variables.org.name);
    expect(org.properties.shortname).toEqual(variables.org.shortname);
    expect(org.properties.infoProvidedAtCreation?.orgSize).toEqual(
      variables.org.orgSize,
    );

    expect(org.entityType.properties.title).toEqual("Org");

    // Test an invitaiton link has been created for the org
    const invitationLinks = await org.getInvitationLinks(db);
    expect(invitationLinks.length).toEqual(1);
    const [invitationLink] = invitationLinks;
    expect(invitationLink).toBeDefined();

    // Test a linked invitationLink has been returned in the createOrg GraphQL mutation

    const invitationLinkLinkGroup = gqlOrg.linkGroups.find(
      ({ sourceEntityId, path }) =>
        sourceEntityId === org.entityId && path === "$.invitationLink",
    )!;

    expect(invitationLinkLinkGroup).toBeDefined();
    expect(invitationLinkLinkGroup.links).toHaveLength(1);
    expect(invitationLinkLinkGroup.links[0]!.destinationEntityId).toBe(
      invitationLink.entityId,
    );

    const gqlInvitationLink = gqlOrg.linkedEntities.find(
      ({ entityId }) => entityId === invitationLink.entityId,
    )!;

    expect(gqlInvitationLink).toBeDefined();
    expect(
      (gqlInvitationLink.properties as OrgInvitationLinkProperties).accessToken,
    ).toBe(invitationLink.properties.accessToken);

    // Test the user is now a member of the org
    const updatedExistingUser = (await User.getUserById(db, existingUser))!;

    expect(updatedExistingUser).not.toBeNull();

    expect(await updatedExistingUser.isMemberOfOrg(db, org.entityId)).toBe(
      true,
    );
  });

  it("can create an org email invitation", async () => {
    const inviteeEmailAddress = `bob-${bobCounter}@hash.test`;

    bobCounter += 1;

    const gqlOrgEmailInvitation = await client.createOrgEmailInvitation({
      orgEntityId: existingOrg.entityId,
      inviteeEmailAddress,
    });

    const inviterLinkGroup = gqlOrgEmailInvitation.linkGroups.find(
      ({ sourceEntityId, path }) =>
        sourceEntityId === gqlOrgEmailInvitation.entityId &&
        path === "$.inviter",
    )!;

    expect(inviterLinkGroup).toBeDefined();
    expect(inviterLinkGroup.links).toHaveLength(1);
    expect(inviterLinkGroup.links[0]!.destinationEntityId).toBe(
      existingUser.entityId,
    );

    const orgLinkGroup = gqlOrgEmailInvitation.linkGroups.find(
      ({ sourceEntityId, path }) =>
        sourceEntityId === gqlOrgEmailInvitation.entityId && path === "$.org",
    )!;

    expect(orgLinkGroup).toBeDefined();
    expect(orgLinkGroup.links).toHaveLength(1);
    expect(orgLinkGroup.links[0]!.destinationEntityId).toBe(
      existingOrg.entityId,
    );

    expect(gqlOrgEmailInvitation.properties.inviteeEmailAddress).toEqual(
      inviteeEmailAddress,
    );

    /** @todo: cleanup created email invitations */
  });

  it("cannot create duplicate org email invitations", async () => {
    const inviteeEmailAddress = `bob-${bobCounter}@hash.test`;
    bobCounter += 1;
    await client.createOrgEmailInvitation({
      orgEntityId: existingOrg.entityId,
      inviteeEmailAddress,
    });

    await client
      .createOrgEmailInvitation({
        orgEntityId: existingOrg.entityId,
        inviteeEmailAddress,
      })
      .catch((error: ClientError) => {
        expect(
          ApiClient.getErrorCodesFromClientError(error).includes(
            "ALREADY_INVITED",
          ),
        ).toBe(true);
      });
  });

  it("can get org email invitation", async () => {
    const { bobUser, bobOrg } = await createNewBobWithOrg();

    const inviteeEmailAddress = existingUser.getPrimaryEmail().address;

    const emailInvitation = await OrgEmailInvitation.createOrgEmailInvitation(
      db,
      emailTransporter,
      {
        org: bobOrg,
        inviter: bobUser,
        inviteeEmailAddress,
      },
    );

    const { invitationLinkToken } = emailTransporter.getMostRecentEmail({
      assertDerivedPayloadType: "orgInvitation",
    }).derivedPayload;

    const gqlEmailInvitation = await client.getOrgEmailInvitation({
      orgEntityId: bobOrg.entityId,
      invitationEmailToken: invitationLinkToken,
    });

    expect(gqlEmailInvitation.entityId).toEqual(emailInvitation.entityId);
    expect(gqlEmailInvitation.properties.inviteeEmailAddress).toEqual(
      inviteeEmailAddress,
    );

    const inviterLinkGroup = gqlEmailInvitation.linkGroups.find(
      ({ sourceEntityId, path }) =>
        sourceEntityId === gqlEmailInvitation.entityId && path === "$.inviter",
    )!;

    expect(inviterLinkGroup).toBeDefined();
    expect(inviterLinkGroup.links).toHaveLength(1);
    expect(inviterLinkGroup.links[0]!.destinationEntityId).toBe(
      bobUser.entityId,
    );

    /** @todo: cleanup created bob user and org */
  });

  it("can get org invitation", async () => {
    const { bobOrg } = await createNewBobWithOrg();

    const [invitation] = await bobOrg.getInvitationLinks(db);

    const gqlInvitation = await client.getOrgInvitationLink({
      orgEntityId: bobOrg.entityId,
      invitationLinkToken: invitation.properties.accessToken,
    });

    expect(gqlInvitation.entityId).toEqual(invitation.entityId);
    const orgLinkGroup = gqlInvitation.linkGroups.find(
      ({ sourceEntityId, path }) =>
        sourceEntityId === gqlInvitation.entityId && path === "$.org",
    )!;

    expect(orgLinkGroup).toBeDefined();
    expect(orgLinkGroup.links).toHaveLength(1);
    expect(orgLinkGroup.links[0]!.destinationEntityId).toBe(bobOrg.entityId);

    /** @todo: cleanup created bob user and org */
  });

  it("can join org with email invitation", async () => {
    const { bobUser, bobOrg } = await createNewBobWithOrg();

    const inviteeEmailAddress = "alice-second@hash.test";

    await OrgEmailInvitation.createOrgEmailInvitation(db, emailTransporter, {
      org: bobOrg,
      inviter: bobUser,
      inviteeEmailAddress,
    });

    const responsibility = "CTO";

    const { invitationLinkToken } = emailTransporter.getMostRecentEmail({
      assertDerivedPayloadType: "orgInvitation",
    }).derivedPayload;

    const gqlUser = await client.joinOrg({
      orgEntityId: bobOrg.entityId,
      verification: { invitationEmailToken: invitationLinkToken },
      responsibility,
    });

    expect(gqlUser.entityId).toEqual(existingUser.entityId);

    expect(await existingUser.isMemberOfOrg(db, bobOrg.entityId)).toBe(true);

    const { emails } = gqlUser;

    const addedEmail = emails.find(
      ({ address }) => address === inviteeEmailAddress,
    )!;

    expect(addedEmail).toBeDefined();
    expect(addedEmail.verified).toEqual(true);
    expect(addedEmail.primary).toEqual(false);
  });

  it("can join org with invitation", async () => {
    const { bobOrg } = await createNewBobWithOrg();

    const [invitation] = await bobOrg.getInvitationLinks(db);

    const responsibility = "CTO";

    const gqlUser = await client.joinOrg({
      orgEntityId: bobOrg.entityId,
      verification: {
        invitationLinkToken: invitation.properties.accessToken,
      },
      responsibility,
    });

    expect(gqlUser.entityId).toEqual(existingUser.entityId);

    expect(await existingUser.isMemberOfOrg(db, bobOrg.entityId)).toBe(true);
  });

  describe("can create and update pages", () => {
    let page: PageFieldsFragment;
    const pageHistory: {
      createdAt: string;
      entityVersionId: string;
    }[] = [];
    it("can create a page", async () => {
      page = await client.createPage({
        accountId: existingUser.accountId,
        properties: {
          title: "My first page",
        },
      });
      pageHistory.unshift({
        createdAt: page.createdAt,
        entityVersionId: page.entityVersionId,
      });
      return page;
    });

    let textEntityId: string;
    it("can add a block to the page", async () => {
      const textProperties = {
        tokens: [{ tokenType: "text", text: "Hello World!" }],
      };

      const updatedPage = await client.updatePageContents({
        accountId: page.accountId,
        entityId: page.entityId,
        actions: [
          {
            insertBlock: {
              accountId: existingUser.accountId,
              componentId: "https://blockprotocol.org/blocks/@hash/header",
              position: 0,
              entity: {
                entityType: {
                  systemTypeName: SystemTypeName.Text,
                },
                entityProperties: textProperties,
              },
            },
          },
        ],
      });

      pageHistory.unshift({
        createdAt: updatedPage.updatedAt,
        entityVersionId: updatedPage.entityVersionId,
      });

      expect(updatedPage.entityId).toEqual(page.entityId);
      // creating a link shouldn't create a new version of the source entity
      expect(updatedPage.entityVersionId).toEqual(page.entityVersionId);
      // expect(updatedPage.history).toHaveLength(2);
      // expect(updatedPage.history).toEqual(pageHistory);
      expect(updatedPage.properties.title).toEqual("My first page");

      // We inserted a block at the beginning of the page. The remaining blocks should
      // be the same.
      expect(updatedPage.contents.length).toEqual(page.contents.length + 1);
      expect(updatedPage.contents.slice(1)).toEqual(page.contents);

      // Get the text entity we just inserted and make sure it matches
      const newBlock = updatedPage.contents[0]!;
      textEntityId = newBlock.data.entityId;
      const textEntity = await client.getUnknownEntity({
        entityId: textEntityId,
        accountId: existingUser.accountId,
      });
      expect(textEntity.entityVersionId).toEqual(newBlock.data.entityVersionId);
      expect(textEntity.properties).toEqual(textProperties);
    });

    it("should create a new page version when a block is updated", async () => {
      // Update the text block inside the page
      const newTextProperties = {
        tokens: [{ tokenType: "text", text: "Hello HASH!" }],
      };
      const { entityVersionId, entityId } = await client.updateEntity({
        accountId: existingUser.accountId,
        entityId: textEntityId,
        properties: newTextProperties,
      });
      expect(textEntityId).toEqual(entityId);

      // Check that the text update succeeded
      const newTextEntity = await client.getUnknownEntity({
        accountId: existingUser.accountId,
        entityVersionId,
      });
      expect(newTextEntity.properties).toEqual(newTextProperties);

      // Check that the updated version of the page references the latest version of the
      // text entity.
      let updatedPage = await client.getPage({
        accountId: existingUser.accountId,
        entityId: page.entityId,
      });

      expect(updatedPage.contents[0]!.data.entityVersionId).toEqual(
        newTextEntity.entityVersionId,
      );

      // Update the header block text entity (2nd block)
      const newHeaderTextProperties = {
        tokens: [{ tokenType: "text", text: "Header Text" }],
      };

      const headerBlock = updatedPage.contents[1]!;
      const headerUpdate = await client.updateEntity({
        accountId: existingUser.accountId,
        entityId: headerBlock.data.entityId,
        properties: newHeaderTextProperties,
      });

      // Check that the page is up-to-date
      updatedPage = await client.getPage({
        accountId: existingUser.accountId,
        entityId: page.entityId,
      });
      expect(updatedPage.contents[1]!.data.entityVersionId).toEqual(
        headerUpdate.entityVersionId,
      );
    });

    // ComponentId doesn't exist in the database
    const componentId = "https://blockprotocol.org/blocks/@hash/unknown";
    let entityTypeComponentId: string;
    it("can add a block with unknown componentId", async () => {
      // No type argument given to insertBlock, only componentId
      const updatedPage = await client.updatePageContents({
        accountId: page.accountId,
        entityId: page.entityId,
        actions: [
          {
            insertBlock: {
              accountId: existingUser.accountId,
              componentId,
              position: 0,
              entity: {
                entityType: {
                  componentId,
                },
                entityProperties: {},
              },
            },
          },
        ],
      });

      pageHistory.unshift({
        createdAt: updatedPage.updatedAt,
        entityVersionId: updatedPage.entityVersionId,
      });

      expect(updatedPage.entityId).toEqual(page.entityId);
      // creating links shouldn't create a new version of the source entity
      expect(updatedPage.entityVersionId).toEqual(page.entityVersionId);
      // expect(updatedPage.history).toHaveLength(3);
      // expect(updatedPage.history).toEqual(pageHistory);
      expect(updatedPage.properties.title).toEqual("My first page");

      // Get the new entity we just inserted and make sure it matches
      const newBlock = updatedPage.contents[0]!;
      const entityId = newBlock.data.entityId;
      entityTypeComponentId = newBlock.data.entityTypeId;

      // Get the EntitType that has been created because of the ComponentId
      const componentIdType = await client.deprecatedGetEntityType({
        entityTypeId: entityTypeComponentId,
      });

      const entityWithComponentIdType = await client.getUnknownEntity({
        entityId,
        accountId: existingUser.accountId,
      });

      expect(entityWithComponentIdType.entityVersionId).toEqual(
        newBlock.data.entityVersionId,
      );
      expect(entityWithComponentIdType.properties).toEqual({});
      expect(entityWithComponentIdType.entityTypeId).toEqual(
        componentIdType.entityId,
      );
      expect(entityWithComponentIdType.entityTypeVersionId).toEqual(
        componentIdType.entityVersionId,
      );
      expect(componentIdType.properties.componentId).toEqual(componentId);
    });

    it("can use entityType that has been created through componentId", async () => {
      // Again, no type argument given to insertBlock, only componentId
      const updatedPage = await client.updatePageContents({
        accountId: page.accountId,
        entityId: page.entityId,
        actions: [
          {
            insertBlock: {
              accountId: existingUser.accountId,
              componentId,
              position: 0,
              entity: {
                entityType: {
                  componentId,
                },
                entityProperties: {},
              },
            },
          },
        ],
      });

      pageHistory.unshift({
        createdAt: updatedPage.updatedAt,
        entityVersionId: updatedPage.entityVersionId,
      });

      expect(updatedPage.entityId).toEqual(page.entityId);
      // updating links shouldn't create a new version of the source entity
      expect(updatedPage.entityVersionId).toEqual(page.entityVersionId);

      // expect(updatedPage.history).toHaveLength(4);
      // expect(updatedPage.history).toEqual(pageHistory);

      expect(updatedPage.properties.title).toEqual("My first page");

      // Get the new entity we just inserted and make sure it matches
      const newBlock = updatedPage.contents[0]!;
      const entityId = newBlock.data.entityId;

      // Get the EntitType that has been created _previously_ because of the ComponentId
      const componentIdType = await client.deprecatedGetEntityType({
        entityTypeId: entityTypeComponentId,
      });

      const entityWithComponentIdType = await client.getUnknownEntity({
        entityId,
        accountId: existingUser.accountId,
      });

      expect(entityWithComponentIdType.entityVersionId).toEqual(
        newBlock.data.entityVersionId,
      );
      expect(entityWithComponentIdType.properties).toEqual({});
      expect(entityWithComponentIdType.entityTypeId).toEqual(
        componentIdType.entityId,
      );
      expect(entityWithComponentIdType.entityTypeVersionId).toEqual(
        componentIdType.entityVersionId,
      );
      expect(componentIdType.properties.componentId).toEqual(componentId);
    });
  });

  describe("can create EntityType inheritance relations", () => {
    let superType: Pick<
      DeprecatedEntityType,
      "entityId" | "properties" | "entityTypeName"
    >;
    beforeAll(async () => {
      superType = await client.deprecatedCreateEntityType({
        accountId: existingUser.accountId,
        name: "Supertype",
        schema: {},
      })!;
    });

    let subType1: Pick<
      DeprecatedEntityType,
      "entityId" | "properties" | "entityTypeName"
    >;
    it("can inherit from SuperType", async () => {
      subType1 = await client.deprecatedCreateEntityType({
        accountId: existingUser.accountId,
        name: "Subtype1",
        schema: { allOf: [{ $ref: superType.properties.$id }] },
      });

      const subTypeParent = await client
        .deprecatedGetEntityType({
          entityTypeId: subType1.entityId,
        })
        .then((entyp) => entyp.parents);

      expect(subTypeParent).toHaveLength(1);
      if (!subTypeParent?.length) {
        throw new Error("");
      }
      expect(subTypeParent[0]!.entityId).toEqual(superType.entityId);
    });

    it("can get all children of supertype", async () => {
      // new subType
      const subType2 = await client.deprecatedCreateEntityType({
        accountId: existingUser.accountId,
        name: "Subtype2",
        schema: { allOf: [{ $ref: superType.properties.$id }] },
      });

      const superTypeChldren = await client
        .deprecatedGetEntityType({
          entityTypeId: superType.entityId,
        })
        .then((entyp) => entyp.children);

      expect(superTypeChldren).toHaveLength(2);
      if (!superTypeChldren?.length) {
        throw new Error("");
      }

      expect(superTypeChldren.map((child) => child.entityId).sort()).toEqual(
        [subType1.entityId, subType2.entityId].sort(),
      );
    });
  });

  it("can atomically update page contents", async () => {
    const page = await client.createPage({
      accountId: existingUser.accountId,
      properties: {
        title: "My first page",
      },
    });
    // The page currently has 1 block: an empty paragraph block
    expect(page.contents).toHaveLength(1);

    const textPropertiesA = { tokens: [{ tokenType: "text", text: "A" }] };
    const textPropertiesB = { tokens: [{ tokenType: "text", text: "B" }] };
    const textPropertiesC = { tokens: [{ tokenType: "text", text: "C" }] };

    const updatedPage = await client.updatePageContents({
      accountId: page.accountId,
      entityId: page.entityId,
      actions: [
        {
          insertBlock: {
            accountId: page.accountId,
            componentId: "https://blockprotocol.org/blocks/@hash/paragraph",
            position: 1,
            entity: {
              entityType: {
                systemTypeName: SystemTypeName.Text,
              },
              entityProperties: textPropertiesA,
            },
          },
        },
        {
          insertBlock: {
            accountId: page.accountId,
            componentId: "https://blockprotocol.org/blocks/@hash/paragraph",
            position: 2,
            entity: {
              entityType: {
                systemTypeName: SystemTypeName.Text,
              },
              entityProperties: textPropertiesB,
            },
          },
        },
        {
          updateEntity: {
            accountId: page.contents[0]!.data.accountId,
            entityId: page.contents[0]!.data.entityId,
            properties: textPropertiesC,
          },
        },
        {
          moveBlock: {
            currentPosition: 1,
            newPosition: 2,
          },
        },
      ],
    });

    const pageEntities = updatedPage.contents.map((block) => block.data);

    expect(pageEntities[2]?.properties).toMatchObject(textPropertiesA);
    expect(pageEntities[1]?.properties).toMatchObject(textPropertiesB);
    expect(pageEntities[0]?.properties).toMatchObject(textPropertiesC);
  });

  describe("can get and filter their entities", () => {
    let page: PageFieldsFragment;
    let pageTypeId: string;
    let pageTypeVersionId: string;
    beforeAll(async () => {
      const createPage = await client.createPage({
        accountId: existingUser.accountId,
        properties: {
          title: "Page with entities",
        },
      });
      pageTypeId = createPage.entityTypeId;
      pageTypeVersionId = createPage.entityTypeVersionId;

      page = await client.updatePageContents({
        accountId: createPage.accountId,
        entityId: createPage.entityId,
        actions: [
          {
            insertBlock: {
              accountId: existingUser.accountId,
              componentId: "https://blockprotocol.org/blocks/@hash/header",
              position: 0,
              entity: {
                entityType: {
                  systemTypeName: SystemTypeName.Text,
                },
                entityProperties: {
                  tokens: [{ tokenType: "text", text: "Hello World!" }],
                },
              },
            },
          },
        ],
      });

      page = await client.updatePageContents({
        accountId: createPage.accountId,
        entityId: createPage.entityId,
        actions: [
          {
            insertBlock: {
              accountId: existingUser.accountId,
              componentId: "https://blockprotocol.org/blocks/@hash/divider",
              position: 1,
              entity: {
                entityType: {
                  componentId: "https://blockprotocol.org/blocks/@hash/divider",
                },
                entityProperties: {},
              },
            },
          },
        ],
      });
    });

    it("can get all their entities", async () => {
      const { entities } = await client.getEntities({
        accountId: page.accountId,
      });

      // There's many entities from the ones added before this test
      expect(entities).toHaveLength(24);

      const numberOfBlockEntities = entities.filter(
        ({ entityTypeName }) => entityTypeName === "Block",
      ).length;
      expect(numberOfBlockEntities).toBe(10);

      const numberOfTextEntities = entities.filter(
        ({ entityTypeName }) => entityTypeName === "Text",
      ).length;
      expect(numberOfTextEntities).toBe(7);

      const numberOfPageEntities = entities.filter(
        ({ entityTypeName }) => entityTypeName === "Page",
      ).length;
      expect(numberOfPageEntities).toBe(3);

      const numberOfDividerEntities = entities.filter(
        ({ entityTypeName }) => entityTypeName === "Divider",
      ).length;
      expect(numberOfDividerEntities).toBe(1);

      const numberOfUnknownEntities = entities.filter(
        ({ entityTypeName }) => entityTypeName === "Unknown",
      ).length;
      expect(numberOfUnknownEntities).toBe(2);

      const numberOfUserEntities = entities.filter(
        ({ entityTypeName }) => entityTypeName === "User",
      ).length;
      expect(numberOfUserEntities).toBe(1);
    });

    it("can get all divider entities by componentId", async () => {
      const { entities } = await client.getEntities({
        accountId: existingUser.accountId,
        filter: {
          entityType: {
            componentId: "https://blockprotocol.org/blocks/@hash/divider",
          },
        },
      });

      expect(entities.length).toEqual(1);
    });

    it("can get all text entities by systemTypeName", async () => {
      const { entities } = await client.getEntities({
        accountId: existingUser.accountId,
        filter: {
          entityType: {
            systemTypeName: SystemTypeName.Text,
          },
        },
      });

      expect(entities.length).toEqual(7);
    });

    it("can get all page entities by typeId", async () => {
      const { entities } = await client.getEntities({
        accountId: existingUser.accountId,
        filter: {
          entityType: {
            entityTypeId: pageTypeId,
          },
        },
      });

      expect(entities.length).toEqual(3);
    });

    it("can get all page entities by typeVersionId", async () => {
      const { entities } = await client.getEntities({
        accountId: existingUser.accountId,
        filter: {
          entityType: {
            entityTypeVersionId: pageTypeVersionId,
          },
        },
      });

      expect(entities.length).toEqual(3);
    });
  });

  it("can create linked entities when updating page contents", async () => {
    const page = await client.createPage({
      accountId: existingUser.accountId,
      properties: {
        title: "Linked page",
      },
    });

    const textPropertiesA = { tokens: [{ tokenType: "text", text: "A" }] };
    const textPropertiesB = { tokens: [{ tokenType: "text", text: "B" }] };
    const textPropertiesC = { tokens: [{ tokenType: "text", text: "C" }] };

    const updatedPage = await client.updatePageContents({
      accountId: page.accountId,
      entityId: page.entityId,
      actions: [
        {
          insertBlock: {
            accountId: page.accountId,
            componentId: "https://blockprotocol.org/blocks/@hash/paragraph",
            position: 1,
            entity: {
              entityType: {
                systemTypeName: SystemTypeName.Text,
              },
              entityProperties: textPropertiesA,
              linkedEntities: [
                {
                  path: "$.textB",
                  destinationAccountId: existingUser.accountId,
                  entity: {
                    entityType: {
                      systemTypeName: SystemTypeName.Text,
                    },
                    entityProperties: textPropertiesB,
                    linkedEntities: [
                      {
                        path: "$.textC",
                        destinationAccountId: existingUser.accountId,
                        entity: {
                          entityType: {
                            systemTypeName: SystemTypeName.Text,
                          },
                          entityProperties: textPropertiesC,
                        },
                      },
                    ],
                  },
                },
              ],
            },
          },
        },
      ],
    });

    expect(updatedPage.contents).toHaveLength(2);

    const pageEntities = updatedPage.contents.map((block) => block.data);

    // The page will have an empty paragraph and a text paragraph with textPropertiesA
    expect(pageEntities[0]?.properties).toMatchObject({ tokens: [] });
    expect(pageEntities[1]?.properties).toMatchObject(textPropertiesA);

    // Check text entity A was created with the correct properties & outgoing links

    const textEntityA = (await Entity.getEntityLatestVersion(db, {
      accountId: pageEntities[1]!.accountId,
      entityId: pageEntities[1]!.entityId,
    }))!;

    expect(textEntityA).not.toBeNull();
    expect(textEntityA.properties).toMatchObject(textPropertiesA);

    const textEntityAOutgoingLinks = await textEntityA.getOutgoingLinks(db);

    expect(textEntityAOutgoingLinks).toHaveLength(1);

    const [textEntityAOutgoingLink] = textEntityAOutgoingLinks;

    expect(textEntityAOutgoingLink.stringifiedPath).toBe("$.textB");

    // Check text entity B was created with the correct properties & outgoing links

    const textEntityB = await textEntityAOutgoingLink.getDestination(db);

    expect(textEntityB.properties).toMatchObject(textPropertiesB);

    const textEntityBOutgoingLinks = await textEntityB.getOutgoingLinks(db);

    expect(textEntityBOutgoingLinks).toHaveLength(1);

    const [textEntityBOutgoingLink] = textEntityBOutgoingLinks;

    expect(textEntityBOutgoingLink.stringifiedPath).toBe("$.textC");

    // Check text entity C was created with the correct properties & outgoing links

    const textEntityC = await textEntityBOutgoingLink.getDestination(db);

    expect(textEntityC.properties).toMatchObject(textPropertiesC);

    const textEntityCOutgoingLinks = await textEntityC.getOutgoingLinks(db);

    expect(textEntityCOutgoingLinks).toHaveLength(0);
  });

  describe("can create entity types", () => {
    const validSchemaInput = {
      description: "Test description",
      schema: {
        title: "Test schema",
        properties: {
          testPropertyString: {
            type: "string",
          },
          testPropertyNumber: {
            type: "number",
          },
        },
      },
      name: "Test schema",
    };

    let testEntityType!: Pick<
      DeprecatedEntityType,
      "entityId" | "properties" | "entityTypeName"
    >;
    it("can create an entity type with a valid schema", async () => {
      testEntityType = await client.deprecatedCreateEntityType({
        accountId: existingUser.accountId,
        ...validSchemaInput,
      });
      expect(testEntityType.properties.title).toEqual(validSchemaInput.name);
      expect(testEntityType.properties.description).toEqual(
        validSchemaInput.description,
      );
    });

    it("enforces uniqueness of schema name in account", async () => {
      await expect(
        client.deprecatedCreateEntityType({
          accountId: existingUser.accountId,
          ...validSchemaInput,
        }),
      ).rejects.toThrowError(/name.+is not unique/i);
    });

    it("rejects entity types with invalid JSON schemas", async () => {
      const schemaName = "Invalid schema entity type";
      await expect(
        client.deprecatedCreateEntityType({
          accountId: existingUser.accountId,
          schema: {
            properties: [],
          },
          name: `${schemaName}1`,
        }),
      ).rejects.toThrowError(/properties must be object/);

      await expect(
        client.deprecatedCreateEntityType({
          accountId: existingUser.accountId,
          schema: {
            properties: {
              testField: 4,
            },
          },
          name: `${schemaName}2`,
        }),
      ).rejects.toThrowError(/testField must be object,boolean/);

      await expect(
        client.deprecatedCreateEntityType({
          accountId: existingUser.accountId,
          schema: {
            invalidKeyword: true,
          },
          name: `${schemaName}3`,
        }),
      ).rejects.toThrowError(/unknown keyword/);
    });

    it("rejects schema that inherits with incompatible property types", async () => {
      const schemaName = "Schema invalid property inheritance";
      await expect(
        client.deprecatedCreateEntityType({
          accountId: existingUser.accountId,
          schema: {
            allOf: [
              {
                $ref: testEntityType.properties.$id,
              },
            ],
            properties: {
              testPropertyString: { type: "number" },
            },
          },
          name: `${schemaName}1`,
        }),
      ).rejects.toThrowError(
        /Type mismatch on ".+". Got "string" expected "number"/i,
      );
    });

    let subType!: Pick<
      DeprecatedEntityType,
      "entityId" | "properties" | "entityTypeName"
    >;
    it("allows schema that inherits with compatible property types", async () => {
      const schemaName = "Schema valid property inheritance";

      subType = await client.deprecatedCreateEntityType({
        accountId: existingUser.accountId,
        schema: {
          allOf: [
            {
              $ref: testEntityType.properties.$id,
            },
          ],
          properties: {
            testPropertyString: { type: "string" },
          },
        },
        name: `${schemaName}1`,
      });
      expect(subType).toBeDefined();
    });

    it("rejects schema that inherits with incompatible property types deeper than top level", async () => {
      const schemaName = "Schema invalid property inheritance";
      await expect(
        client.deprecatedCreateEntityType({
          accountId: existingUser.accountId,
          schema: {
            allOf: [
              {
                $ref: subType.properties.$id,
              },
            ],
            properties: {
              testPropertyNumber: { type: "string" },
            },
          },
          name: `${schemaName}1`,
        }),
      ).rejects.toThrowError(
        /Type mismatch on ".+". Got "number" expected "string"/i,
      );
    });

    it("can get inheritance chain of a EntityType", async () => {
      const schemaName = "ThreeLayerType";

      const entityType = await client.deprecatedCreateEntityType({
        accountId: existingUser.accountId,
        schema: {
          allOf: [
            {
              $ref: subType.properties.$id,
            },
          ],
          properties: {
            anotherProp: { type: "string" },
          },
        },
        name: `${schemaName}1`,
      });

      const fetched = await client.getEntityTypeAllParents({
        entityTypeId: entityType.entityId,
      });

      const allParentEntityIds = fetched.ancestors?.map((x) => x.entityId);
      expect(allParentEntityIds).toHaveLength(2);
      expect(allParentEntityIds).toContain(testEntityType.entityId);
      expect(allParentEntityIds).toContain(subType.entityId);
    });
  });

  describe("can update entity types", () => {
    const validSchemaInput = {
      description: "Another test description",
      schema: {
        title: "A schema to update",
        properties: {
          testProperty: {
            type: "string",
          },
        },
      },
      name: "A schema to update",
    };

    it("can update an entity type's schema", async () => {
      const entityType = await client.deprecatedCreateEntityType({
        accountId: existingUser.accountId,
        ...validSchemaInput,
      });
      expect(entityType.properties.description).toEqual(
        validSchemaInput.description,
      );

      const newDescription = "Now this is updated";

      const updatedEntityType = await client.deprecatedUpdateEntityType({
        entityId: entityType.entityId,
        schema: {
          ...validSchemaInput.schema,
          description: newDescription,
        },
      });

      expect(updatedEntityType.properties.title).toEqual(validSchemaInput.name);
      expect(updatedEntityType.properties.description).toEqual(newDescription);
    });
  });

  describe("can create page trees", () => {
    let superPage: PageFieldsFragment;
    const superTitle = "Super page 1";
    beforeAll(async () => {
      superPage = await client.createPage({
        accountId: existingUser.accountId,
        properties: {
          title: superTitle,
        },
      });
    });

    let subPage: PageFieldsFragment;
    it("can create a subpage", async () => {
      // - Super page 1
      //   - sub page 1
      const title = "sub page 1";
      subPage = await client.createPage({
        accountId: existingUser.accountId,
        properties: {
          title,
        },
      });

      const result = await client.setParentPage({
        pageEntityId: subPage.entityId,
        parentPageEntityId: superPage.entityId,
      });

      const pageTree = await client.getAccountPagesTree({
        accountId: existingUser.accountId,
      });

      expect(result.entityId).toEqual(subPage.entityId);
      expect(pageTree).toContainEqual({
        entityId: subPage.entityId,
        properties: { title, pageEntityId: subPage.entityId },
        parentPageEntityId: superPage.entityId,
      });
    });

    let subSubPage: PageFieldsFragment;
    it("can create a subsubpage", async () => {
      // - Super page 1
      //   - sub page 1
      //     - sub sub page 1
      const title = "sub sub page 1";
      subSubPage = await client.createPage({
        accountId: existingUser.accountId,
        properties: {
          title,
        },
      });

      const result = await client.setParentPage({
        pageEntityId: subSubPage.entityId,
        parentPageEntityId: subPage.entityId,
      });

      const pageTree = await client.getAccountPagesTree({
        accountId: existingUser.accountId,
      });

      expect(result.entityId).toEqual(subSubPage.entityId);
      expect(pageTree).toContainEqual({
        entityId: subSubPage.entityId,
        properties: { title, pageEntityId: subSubPage.entityId },
        parentPageEntityId: subPage.entityId,
      });
    });

    it("prevent cyclic page trees", async () => {
      // - Super page 1
      //   - sub page 1
      //     - sub sub page 1
      //       - Super page 1 <- should not be allowed since it would introduce a cycle
      await expect(
        client.setParentPage({
          pageEntityId: superPage.entityId,
          parentPageEntityId: subSubPage.entityId,
        }),
      ).rejects.toThrowError(
        /Could not set '.*' as parent of '.*', this would create a cyclic dependency./i,
      );
    });

    it("prevent cyclic page trees when changing parent", async () => {
      // - Super page 1
      //   - sub page 1
      //     - sub sub page 1  <- because this page has 'sub page 1' as a parent. A cyclic dependency would be created
      //       - sub page 1 <- should not be allowed
      await expect(
        client.setParentPage({
          pageEntityId: subPage.entityId,
          parentPageEntityId: subSubPage.entityId,
        }),
      ).rejects.toThrowError(
        /Could not set '.*' as parent of '.*', this would create a cyclic dependency./i,
      );
    });

    it("can reconstruct a tree based on the resulting pages", async () => {
      type TreeElement = {
        entityId: string;
        parentPageEntityId: string;
        properties: {
          title: string;
        };
        children?: TreeElement[];
      };

      const pages = (
        await client.getAccountPagesTree({
          accountId: existingUser.accountId,
        })
      ).map((page) => ({ children: undefined, ...page } as TreeElement));

      const treePages = treeFromParentReferences(
        pages,
        "entityId",
        "parentPageEntityId",
        "children",
      );

      expect(treePages).toContainEqual({
        parentPageEntityId: undefined,
        entityId: superPage.entityId,
        properties: { title: superTitle, pageEntityId: superPage.entityId },
        children: [
          {
            parentPageEntityId: superPage.entityId,
            entityId: subPage.entityId,
            properties: {
              title: subPage.properties.title,
              pageEntityId: subPage.entityId,
            },
            children: [
              {
                parentPageEntityId: subPage.entityId,
                entityId: subSubPage.entityId,
                properties: {
                  title: subSubPage.properties.title,
                  pageEntityId: subSubPage.entityId,
                },
                children: undefined,
              },
            ],
          },
        ],
      });
    });

    it("Allow changing parent", async () => {
      // - Super page 1
      //   - sub page 1
      //   - sub sub page 1 <- changed to be a sub page.
      const title = "sub sub page 1";

      const result = await client.setParentPage({
        pageEntityId: subSubPage.entityId,
        parentPageEntityId: superPage.entityId,
      });

      const pageTree = await client.getAccountPagesTree({
        accountId: existingUser.accountId,
      });

      expect(result.entityId).toEqual(subSubPage.entityId);
      expect(pageTree).toContainEqual({
        entityId: subSubPage.entityId,
        properties: { title, pageEntityId: subSubPage.entityId },
        parentPageEntityId: superPage.entityId,
      });
    });

    it("Allow removing parents", async () => {
      // - Super page 1
      //   - sub page 1
      // - sub sub page 1 <- changed to be a top-level page
      const title = "sub sub page 1";

      const result = await client.setParentPage({
        pageEntityId: subSubPage.entityId,
        parentPageEntityId: null,
      });

      const pageTree = await client.getAccountPagesTree({
        accountId: existingUser.accountId,
      });

      expect(result.entityId).toEqual(subSubPage.entityId);
      expect(pageTree).toContainEqual({
        entityId: subSubPage.entityId,
        properties: { title, pageEntityId: subSubPage.entityId },
        parentPageEntityId: null,
      });
    });

    it("Allow changing parent to itself", async () => {
      // - Super page 1 <- try to set this as its own parent
      //   - sub page 1
      //   - sub sub page 1
      await expect(
        client.setParentPage({
          pageEntityId: superPage.entityId,
          parentPageEntityId: superPage.entityId,
        }),
      ).rejects.toThrowError(/A page cannot be the parent of itself/i);
    });
  });

  it("can only create 5 login codes before being rate limited", async () => {
    // The first code is the one when the account was created, so we should fail at the fourth one
    const { address: emailAddress } = existingUser.getPrimaryEmail();
    for (let i = 0; i < 3; i++) {
      await expect(
        client.sendLoginCode({
          emailOrShortname: emailAddress,
        }),
      ).resolves.not.toThrow();
    }

    // 5th code should throw
    await expect(
      client.sendLoginCode({
        emailOrShortname: emailAddress,
      }),
    ).rejects.toThrowError(/has created too many verification codes recently/);
  });

  it("can create linked aggregation for an entity", async () => {
    const sourceEntityType = await createEntityType();

    const sourceEntity = await createEntity({
      entityTypeId: sourceEntityType.entityId,
    });

    const aggregateEntityType = await createEntityType();

    const numberOfAggregateEntities = 3;

    await Promise.all(
      [...Array(numberOfAggregateEntities).keys()].map(() =>
        createEntity({ entityTypeId: aggregateEntityType.entityId }),
      ),
    );

    const variables = {
      sourceAccountId: sourceEntity.accountId,
      sourceEntityId: sourceEntity.entityId,
      path: "$.test",
      operation: {
        entityTypeId: aggregateEntityType.entityId,
        itemsPerPage: 10,
        pageNumber: 1,
      },
    };

    const gqlAggregation = await client.createLinkedAggregation(variables);

    expect(gqlAggregation.path).toBe(variables.path);
    expect(gqlAggregation.sourceAccountId).toBe(variables.sourceAccountId);
    expect(gqlAggregation.sourceEntityId).toBe(variables.sourceEntityId);
    expect(gqlAggregation.operation).toEqual({
      ...variables.operation,
      pageCount: 1,
    });
    expect(gqlAggregation.results).toHaveLength(numberOfAggregateEntities);

    const { aggregationId } = gqlAggregation;

    const aggregation = (await Aggregation.getAggregationById(db, {
      ...variables,
      aggregationId,
    }))!;

    expect(aggregation).not.toBeNull();
    expect(aggregation.stringifiedPath).toBe(variables.path);
  });

  it("can create linked entities outside a page", async () => {
    const sourceEntityType = await createEntityType();
    const linkedEntityType = await createEntityType();

    const entityWithLinks = await client.createEntity({
      accountId: existingUser.accountId,
      entityTypeId: sourceEntityType.entityId,
      properties: {},
      linkedEntities: {
        destinationAccountId: existingUser.accountId,
        path: "$.second",
        entity: {
          entityProperties: {},
          entityType: {
            entityTypeId: linkedEntityType.entityId,
          },
        },
      },
    });

    const withLinks = await client.getEntityAndLinks({
      accountId: existingUser.accountId,
      entityId: entityWithLinks.entityId,
    });

    expect(withLinks.entityId).toEqual(entityWithLinks.entityId);
    expect(withLinks.linkedEntities.length).toEqual(1);
    expect(withLinks.linkedEntities[0]!.entityTypeName).toEqual("Dummy-4");
    expect(withLinks.linkedEntities[0]!.entityTypeId).toEqual(
      linkedEntityType.entityId,
    );
  });

  it("can update operation of existing linked aggregation for an entity", async () => {
    const sourceEntityType = await createEntityType();

    const sourceEntity = await createEntity({
      entityTypeId: sourceEntityType.entityId,
    });

    const aggregateEntityType1 = await createEntityType();

    const stringifiedPath = "$.test";

    const { aggregationId } = await sourceEntity.createAggregation(db, {
      stringifiedPath,
      createdBy: existingUser,
      operation: {
        entityTypeId: aggregateEntityType1.entityId,
        itemsPerPage: 10,
        pageNumber: 1,
      },
    });

    const aggregateEntityType2 = await createEntityType();

    const updatedOperation = {
      entityTypeId: aggregateEntityType2.entityId,
      itemsPerPage: 10,
      pageNumber: 1,
    };

    const updatedGQLAggregation = await client.updateLinkedAggregationOperation(
      {
        sourceAccountId: sourceEntity.accountId,
        aggregationId,
        updatedOperation,
      },
    );

    expect(updatedGQLAggregation.operation).toEqual({
      ...updatedOperation,
      pageCount: 0,
    });

    const aggregation = (await Aggregation.getAggregationById(db, {
      sourceAccountId: existingUser.accountId,
      aggregationId,
    }))!;

    expect(aggregation).not.toBeNull();
    expect(aggregation.operation).toEqual(updatedOperation);
  });

  it("can delete existing linked aggregation for an entity", async () => {
    const sourceEntityType = await createEntityType();

    const sourceEntity = await createEntity({
      entityTypeId: sourceEntityType.entityId,
    });

    const aggregateEntityType = await createEntityType();

    const stringifiedPath = "$.test";

    const { aggregationId } = await sourceEntity.createAggregation(db, {
      stringifiedPath,
      createdBy: existingUser,
      operation: {
        entityTypeId: aggregateEntityType.entityId,
        itemsPerPage: 10,
        pageNumber: 1,
      },
    });

    await client.deleteLinkedAggregation({
      sourceAccountId: sourceEntity.accountId,
      aggregationId,
    });

    const aggregation = await Aggregation.getAggregationById(db, {
      sourceAccountId: sourceEntity.accountId,
      aggregationId,
    });

    expect(aggregation).toBeNull();
  });
});
