import "./loadTestEnv";
import {
  Org,
  OrgEmailInvitation,
  User,
  VerificationCode,
} from "@hashintel/hash-api/src/model";
import { PostgresAdapter } from "@hashintel/hash-api/src/db";
import EmailTransporter from "@hashintel/hash-api/src/email/transporter";
import TestEmailTransporter from "@hashintel/hash-api/src/email/transporter/testEmailTransporter";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { ClientError } from "graphql-request";
import { ApiClient } from "./util";
import { IntegrationTestsHandler } from "./setup";
import {
  CreateOrgMutationVariables,
  OrgSize,
  PageFieldsFragment,
  SystemTypeName,
  WayToUseHash,
} from "../graphql/apiTypes.gen";

jest.setTimeout(60000);

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

const client = new ApiClient("http://localhost:5001/graphql");

let bobCounter = 0;

let handler: IntegrationTestsHandler;

let db: PostgresAdapter;

let transporter: EmailTransporter;

let existingUser: User;

let existingOrg: Org;

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
    memberOf: [],
    infoProvidedAtSignup: { usingHow: WayToUseHash.WithATeam },
  });

  bobCounter += 1;

  const bobOrg = await Org.createOrg(db, {
    createdById: bobUser.entityId,
    properties: {
      shortname: `${bobUser.properties.shortname}-org`,
      name: `${bobUser.properties.preferredName}'s Org`,
      memberships: [],
    },
  });

  await bobUser.joinOrg(db, { org: bobOrg, responsibility: "CEO" });

  return { bobUser, bobOrg };
};

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

  transporter = new TestEmailTransporter();

  existingUser = await User.createUser(db, {
    shortname: "test-user",
    preferredName: "Alice",
    emails: [{ address: "alice@hash.test", primary: true, verified: true }],
    memberOf: [],
    infoProvidedAtSignup: { usingHow: WayToUseHash.ByThemselves },
  });

  existingOrg = await Org.createOrg(db, {
    createdById: existingUser.entityId,
    properties: {
      shortname: "bigco",
      name: "Big Company",
      memberships: [],
    },
  });

  await existingUser.joinOrg(db, { org: existingOrg, responsibility: "CEO" });
});

afterAll(async () => {
  await handler.close();
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
  expect(user.entityCreatedAt).toEqual(user.entityVersionUpdatedAt);
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

  const emailInvitation = await OrgEmailInvitation.createOrgEmailInvitation(
    db,
    transporter,
    {
      org: existingOrg,
      inviter: existingUser,
      inviteeEmailAddress,
    },
  );

  /** @todo: use test email transporter to obtain email invitation token */
  const invitationEmailToken = emailInvitation.properties.accessToken;

  const { entityId, accountSignupComplete } =
    await client.createUserWithOrgEmailInvitation({
      orgEntityId: existingOrg.entityId,
      invitationEmailToken,
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

    const cookie = setCookieValue.split(";")[0];

    client.setCookie(cookie);
  });

  afterAll(async () => {
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

    const { entityId, properties: gqlOrgProperties } = await client.createOrg(
      variables,
    );

    const org = (await Org.getOrgById(db, { entityId }))!;

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
    expect(invitationLink).not.toBeUndefined();

    // Test the invitation link has been returned in the createOrg GraphQL mutation
    expect(gqlOrgProperties.invitationLink?.data.entityId).toEqual(
      invitationLink.entityId,
    );
    expect(
      gqlOrgProperties.invitationLink?.data.properties.accessToken,
    ).toEqual(invitationLink.properties.accessToken);

    // Test the user is now a member of the org
    const updatedExistingUser = (await User.getUserById(db, existingUser))!;

    expect(updatedExistingUser).not.toBeNull();

    expect(await updatedExistingUser.isMemberOfOrg(db, org)).toBe(true);
  });

  it("can create an org email invitation", async () => {
    const inviteeEmailAddress = `bob-${bobCounter}@hash.test`;

    bobCounter += 1;

    const response = await client.createOrgEmailInvitation({
      orgEntityId: existingOrg.entityId,
      inviteeEmailAddress,
    });

    expect(response.properties.inviter.data.entityId).toEqual(
      existingUser.entityId,
    );
    expect(response.properties.inviteeEmailAddress).toEqual(
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
      transporter,
      {
        org: bobOrg,
        inviter: bobUser,
        inviteeEmailAddress,
      },
    );

    const gqlEmailInvitation = await client.getOrgEmailInvitation({
      orgEntityId: bobOrg.entityId,
      invitationEmailToken: emailInvitation.properties.accessToken,
    });

    expect(gqlEmailInvitation.entityId).toEqual(emailInvitation.entityId);
    expect(gqlEmailInvitation.properties.inviteeEmailAddress).toEqual(
      inviteeEmailAddress,
    );
    expect(gqlEmailInvitation.properties.inviter.data.entityId).toEqual(
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
    expect(gqlInvitation.properties.org.data.entityId).toEqual(bobOrg.entityId);

    /** @todo: cleanup created bob user and org */
  });

  it("can join org with email invitation", async () => {
    const { bobUser, bobOrg } = await createNewBobWithOrg();

    const inviteeEmailAddress = "alice-second@hash.test";

    const emailInvitation = await OrgEmailInvitation.createOrgEmailInvitation(
      db,
      transporter,
      {
        org: bobOrg,
        inviter: bobUser,
        inviteeEmailAddress,
      },
    );

    const responsibility = "CTO";

    const gqlUser = await client.joinOrg({
      orgEntityId: bobOrg.entityId,
      verification: {
        invitationEmailToken: emailInvitation.properties.accessToken,
      },
      responsibility,
    });

    expect(gqlUser.entityId).toEqual(existingUser.entityId);

    const gqlMemberOf = gqlUser.properties.memberOf.find(
      ({ data }) => data.properties.org.data.entityId === bobOrg.entityId,
    )!;

    expect(gqlMemberOf).not.toBeUndefined();
    expect(gqlMemberOf.data.properties.responsibility).toEqual(responsibility);

    const { emails } = gqlUser.properties;

    const addedEmail = emails.find(
      ({ address }) => address === inviteeEmailAddress,
    )!;

    expect(addedEmail).not.toBeUndefined();
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

    const gqlMemberOf = gqlUser.properties.memberOf.find(
      ({ data }) => data.properties.org.data.entityId === bobOrg.entityId,
    )!;

    expect(gqlMemberOf).not.toBeUndefined();
    expect(gqlMemberOf.data.properties.responsibility).toEqual(responsibility);
  });

  describe("can create and update pages", () => {
    let page: PageFieldsFragment;
    it("can create a page", async () => {
      page = await client.createPage({
        accountId: existingUser.accountId,
        properties: {
          title: "My first page",
        },
      });
      return page;
    });

    let textEntityId: string;
    it("can add a block to the page", async () => {
      const textProperties = {
        tokens: [{ tokenType: "text", text: "Hello World!" }],
      };
      const updatedPage = await client.insertBlocksIntoPage({
        accountId: existingUser.accountId,
        entityId: page.entityId,
        entityVersionId: page.entityVersionId,
        blocks: [
          {
            accountId: existingUser.accountId,
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
          entityVersionId: updatedPage.entityVersionId,
        },
        { createdAt: page.createdAt, entityVersionId: page.entityVersionId },
      ]);
      expect(updatedPage.properties.title).toEqual("My first page");

      // We inserted a block at the beginning of the page. The remaining blocks should
      // be the same.
      expect(updatedPage.properties.contents.length).toEqual(
        page.properties.contents.length + 1,
      );
      expect(updatedPage.properties.contents.slice(1)).toEqual(
        page.properties.contents,
      );

      // Get the text entity we just inserted and make sure it matches
      const newBlock = updatedPage.properties.contents[0];
      textEntityId = newBlock.properties.entity.metadataId;
      const textEntity = await client.getUnknownEntity({
        entityId: textEntityId,
        accountId: existingUser.accountId,
      });
      expect(textEntity.entityVersionId).toEqual(newBlock.properties.entity.id);
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
      expect(updatedPage.properties.contents[0].properties.entity.id).toEqual(
        newTextEntity.entityVersionId,
      );

      // Update the header block text entity (2nd block)
      const newHeaderTextProperties = {
        tokens: [{ tokenType: "text", text: "Header Text" }],
      };
      const headerBlock = updatedPage.properties.contents[1];
      const headerUpdate = await client.updateEntity({
        accountId: existingUser.accountId,
        entityId: headerBlock.properties.entity.metadataId,
        properties: newHeaderTextProperties,
      });

      // Check that the page is up-to-date
      updatedPage = await client.getPage({
        accountId: existingUser.accountId,
        entityId: page.entityId,
      });
      expect(updatedPage.properties.contents[1].properties.entity.id).toEqual(
        headerUpdate.entityVersionId,
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
    // The page currently has 2 blocks: an empty title block and an empty paragraph block
    expect(page.properties.contents).toHaveLength(2);

    const textPropertiesA = { tokens: [{ tokenType: "text", text: "A" }] };
    const textPropertiesB = { tokens: [{ tokenType: "text", text: "B" }] };
    const textPropertiesC = { tokens: [{ tokenType: "text", text: "C" }] };
    const titleProperties = {
      tokens: [{ tokenType: "text", text: "Hello HASH!" }],
    };
    const updatedPage = await client.updatePageContents({
      accountId: page.accountId,
      entityId: page.entityId,
      actions: [
        {
          insertNewBlock: {
            accountId: page.accountId,
            componentId: "https://block.blockprotocol.org/paragraph",
            position: 2,
            systemTypeName: SystemTypeName.Text,
            entityProperties: textPropertiesA,
          },
        },
        {
          insertNewBlock: {
            accountId: page.accountId,
            componentId: "https://block.blockprotocol.org/paragraph",
            position: 3,
            systemTypeName: SystemTypeName.Text,
            entityProperties: textPropertiesB,
          },
        },
        {
          updateEntity: {
            accountId: page.properties.contents[1].properties.entity.accountId,
            entityId: page.properties.contents[1].properties.entity.metadataId,
            properties: textPropertiesC,
          },
        },
        {
          moveBlock: {
            currentPosition: 1,
            newPosition: 3,
          },
        },
        {
          updateEntity: {
            accountId: page.properties.contents[0].properties.entity.accountId,
            entityId: page.properties.contents[0].properties.entity.metadataId,
            properties: titleProperties,
          },
        },
      ],
    });

    const pageEntities = updatedPage.properties.contents.map(
      (block) => block.properties.entity as any,
    );
    expect(pageEntities[0].properties).toMatchObject(titleProperties);
    expect(pageEntities[1].properties).toMatchObject(textPropertiesA);
    expect(pageEntities[2].properties).toMatchObject(textPropertiesB);
    expect(pageEntities[3].properties).toMatchObject(textPropertiesC);
  });

  describe("can create entity types", () => {
    const validSchemaInput = {
      description: "Test description",
      schema: {
        properties: {
          testProperty: {
            type: "string",
          },
        },
      },
      name: "Test schema",
    };

    it("can create an entity type with a valid schema", async () => {
      const entityType = await client.createEntityType({
        accountId: existingUser.accountId,
        ...validSchemaInput,
      });
      expect(entityType.properties.title).toEqual(validSchemaInput.name);
      expect(entityType.properties.description).toEqual(
        validSchemaInput.description,
      );
    });

    it("enforces uniqueness of schema name in account", async () => {
      await expect(
        client.createEntityType({
          accountId: existingUser.accountId,
          ...validSchemaInput,
        }),
      ).rejects.toThrowError(/name.+is not unique/i);
    });

    it("rejects entity types with invalid JSON schemas", async () => {
      const schemaName = "Invalid schema entity type";
      await expect(
        client.createEntityType({
          accountId: existingUser.accountId,
          schema: {
            properties: [],
          },
          name: schemaName + 1,
        }),
      ).rejects.toThrowError(/properties must be object/);

      await expect(
        client.createEntityType({
          accountId: existingUser.accountId,
          schema: {
            properties: {
              testField: 4,
            },
          },
          name: schemaName + 2,
        }),
      ).rejects.toThrowError(/testField must be object,boolean/);

      await expect(
        client.createEntityType({
          accountId: existingUser.accountId,
          schema: {
            invalidKeyword: true,
          },
          name: schemaName + 3,
        }),
      ).rejects.toThrowError(/unknown keyword/);
    });
  });

  it("Can only create 5 login codes before being rate limited", async () => {
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
});
