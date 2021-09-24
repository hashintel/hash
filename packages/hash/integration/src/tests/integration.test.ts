import "./loadTestEnv";
import {
  Org,
  OrgEmailInvitation,
  User,
  VerificationCode,
} from "@hashintel/hash-backend/src/model";
import { PostgresAdapter } from "@hashintel/hash-backend/src/db";
import EmailTransporter from "@hashintel/hash-backend/src/email/transporter";
import SesEmailTransporter from "@hashintel/hash-backend/src/email/transporter/awsSes";

import { ApiClient } from "./util";
import { IntegrationTestsHandler } from "./setup";
import {
  CreateOrgMutationVariables,
  OrgSize,
  PageFieldsFragment,
  SystemTypeName,
  WayToUseHash,
} from "../graphql/apiTypes.gen";
import { ClientError } from "graphql-request";

const client = new ApiClient("http://localhost:5001/graphql");

let bobCounter = 0;

let handler: IntegrationTestsHandler;

let db: PostgresAdapter;

let transporter: EmailTransporter;

let existingUser: User;

let existingOrg: Org;

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

  transporter = new SesEmailTransporter();

  existingUser = await User.createUser(db)({
    shortname: "test-user",
    preferredName: "Alice",
    emails: [{ address: "alice@bigco.com", primary: true, verified: true }],
    memberOf: [],
    infoProvidedAtSignup: { usingHow: WayToUseHash.ByThemselves },
  });

  existingOrg = await Org.createOrg(db)({
    createdById: existingUser.entityId,
    properties: {
      shortname: "bigco",
      name: "Big Company",
    },
  });

  await existingUser.joinOrg(db)({ org: existingOrg, responsibility: "CEO" });
});

afterAll(async () => {
  await handler.close();
  await db.close();
});

it("can create user", async () => {
  const email = `bob-${bobCounter}@bigco.com`;

  bobCounter += 1;

  const { id: verificationCodeId, createdAt: verificationCodeCreatedAt } =
    await client.createUser({ email });

  const user = (await User.getUserByEmail(db)({
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
  const verificationCode = (await VerificationCode.getById(db)({
    id: verificationCodeId,
  }))!;

  expect(verificationCode).not.toBeNull();
  expect(verificationCode.createdAt.toISOString()).toBe(
    verificationCodeCreatedAt
  );

  /** @todo: cleanup created user in datastore */
});

it("can create user with email verification code", async () => {
  const inviteeEmailAddress = "david@bigco.com";

  const emailInvitation = await OrgEmailInvitation.createOrgEmailInvitation(
    db,
    transporter
  )({
    org: existingOrg,
    inviter: existingUser,
    inviteeEmailAddress,
  });

  /** @todo: use test email transporter to obtain email invitation token */
  const emailInvitationToken = emailInvitation.properties.accessToken;

  const { accountId, entityId, accountSignupComplete } =
    await client.createUserWithOrgEmailInvitation({
      orgAccountId: existingOrg.accountId,
      orgEntityId: existingOrg.entityId,
      emailInvitationToken,
    });

  expect(accountSignupComplete).toEqual(false);

  const user = (await User.getUserById(db)({ accountId, entityId }))!;

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

    const verificationCodeOrNull = await VerificationCode.getById(db)({
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
    const variables: CreateOrgMutationVariables = {
      org: {
        name: "Second Big Company",
        shortname: "bigco2",
        orgSize: OrgSize.TwoHundredAndFiftyPlus,
      },
      responsibility: "CEO",
    };

    const { accountId, entityId } = await client.createOrg(variables);

    const org = (await Org.getOrgById(db)({ accountId, entityId }))!;

    // Test the org has been created correctly
    expect(org).not.toBeNull();
    expect(org.properties.name).toEqual(variables.org.name);
    expect(org.properties.shortname).toEqual(variables.org.shortname);
    expect(org.properties.infoProvidedAtCreation?.orgSize).toEqual(
      variables.org.orgSize
    );
    expect(org.entityCreatedAt).toEqual(org.entityVersionUpdatedAt);
    expect(org.entityType.properties.title).toEqual("Org");

    // Test the user is now a member of the org
    const updatedExistingUser = (await User.getUserById(db)(existingUser))!;

    expect(updatedExistingUser).not.toBeNull();

    const orgMembership = updatedExistingUser.properties.memberOf.find(
      ({ org: linkedOrg }) => linkedOrg.__linkedData.entityId === org.entityId
    );

    expect(orgMembership).toEqual({
      org: {
        __linkedData: {
          entityId: org.entityId,
          entityTypeId: org.entityType.entityId,
        },
      },
      responsibility: variables.responsibility,
    });
  });

  it("can create an org email invitation", async () => {
    const inviteeEmailAddress = `bob-${bobCounter}@bigco.com`;

    bobCounter += 1;

    const response = await client.createOrgEmailInvitation({
      orgAccountId: existingOrg.accountId,
      orgEntityId: existingOrg.entityId,
      inviteeEmailAddress,
    });

    expect(response.properties.inviter.data.entityId).toEqual(
      existingUser.entityId
    );
    expect(response.properties.inviteeEmailAddress).toEqual(
      inviteeEmailAddress
    );

    /** @todo: cleanup created email invitations */
  });

  it("cannot create duplicate org email invitations", async () => {
    const inviteeEmailAddress = `bob-${bobCounter}@bigco.com`;
    bobCounter += 1;
    await client.createOrgEmailInvitation({
      orgAccountId: existingOrg.accountId,
      orgEntityId: existingOrg.entityId,
      inviteeEmailAddress,
    });

    await client
      .createOrgEmailInvitation({
        orgAccountId: existingOrg.accountId,
        orgEntityId: existingOrg.entityId,
        inviteeEmailAddress,
      })
      .catch((error: ClientError) => {
        expect(
          ApiClient.getErrorCodesFromClientError(error).includes(
            "ALREADY_INVITED"
          )
        ).toBe(true);
      });
  });

  it("can get org email invitation", async () => {
    const bobUser = await User.createUser(db)({
      shortname: `bob-${bobCounter}`,
      preferredName: `Bob-${bobCounter}`,
      emails: [
        {
          address: `bob-${bobCounter}@bigco.com`,
          primary: true,
          verified: true,
        },
      ],
      memberOf: [],
      infoProvidedAtSignup: { usingHow: WayToUseHash.WithATeam },
    });

    bobCounter += 1;

    const bobOrg = await Org.createOrg(db)({
      createdById: bobUser.entityId,
      properties: {
        shortname: `${bobUser.properties.shortname}-org`,
        name: `${bobUser.properties.preferredName}'s Org`,
      },
    });

    await bobUser.joinOrg(db)({ org: bobOrg, responsibility: "CEO" });

    const inviteeEmailAddress = existingUser.getPrimaryEmail().address;

    const emailInvitation = await OrgEmailInvitation.createOrgEmailInvitation(
      db,
      transporter
    )({
      org: bobOrg,
      inviter: bobUser,
      inviteeEmailAddress,
    });

    const gqlEmailInvitation = await client.orgEmailInvitation({
      orgAccountId: bobOrg.accountId,
      orgEntityId: bobOrg.entityId,
      emailInvitationToken: emailInvitation.properties.accessToken,
    });

    expect(gqlEmailInvitation.entityId).toEqual(emailInvitation.entityId);
    expect(gqlEmailInvitation.properties.inviteeEmailAddress).toEqual(
      inviteeEmailAddress
    );
    expect(gqlEmailInvitation.properties.inviter.data.entityId).toEqual(
      bobUser.entityId
    );

    /** @todo: cleanup created bob user and org */
  });

  it("can get org invitation", async () => {
    const bobUser = await User.createUser(db)({
      shortname: `bob-${bobCounter}`,
      preferredName: `Bob-${bobCounter}`,
      emails: [
        {
          address: `bob-${bobCounter}@bigco.com`,
          primary: true,
          verified: true,
        },
      ],
      memberOf: [],
      infoProvidedAtSignup: { usingHow: WayToUseHash.WithATeam },
    });

    bobCounter += 1;

    const bobOrg = await Org.createOrg(db)({
      createdById: bobUser.entityId,
      properties: {
        shortname: `${bobUser.properties.shortname}-org`,
        name: `${bobUser.properties.preferredName}'s Org`,
      },
    });

    await bobUser.joinOrg(db)({ org: bobOrg, responsibility: "CEO" });

    const [invitation] = await bobOrg.getInvitations(db);

    const gqlInvitation = await client.orgInvitation({
      orgAccountId: bobOrg.accountId,
      orgEntityId: bobOrg.entityId,
      invitationToken: invitation.properties.accessToken,
    });

    expect(gqlInvitation.entityId).toEqual(invitation.entityId);
    expect(gqlInvitation.properties.org.data.entityId).toEqual(bobOrg.entityId);

    /** @todo: cleanup created bob user and org */
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
      const textProperties = { texts: [{ text: "Hello World!" }] };
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
        accountId: existingUser.accountId,
      });
      expect(textEntity.entityVersionId).toEqual(newBlock.properties.entity.id);
      expect(textEntity.properties).toEqual(textProperties);
    });

    it("should create a new page version when a block is updated", async () => {
      // Update the text block inside the page
      const newTextProperties = { texts: [{ text: "Hello HASH!" }] };
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
        newTextEntity.entityVersionId
      );

      // Update the header block text entity (2nd block)
      const newHeaderTextProperties = { texts: [{ text: "Header Text" }] };
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
        headerUpdate.entityVersionId
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

    const textPropertiesA = { texts: [{ text: "A" }] };
    const textPropertiesB = { texts: [{ text: "B" }] };
    const textPropertiesC = { texts: [{ text: "C" }] };
    const titleProperties = { texts: [{ text: "Hello HASH!" }] };
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
      (block) => block.properties.entity as any
    );
    expect(pageEntities[0].textProperties).toMatchObject(titleProperties);
    expect(pageEntities[1].textProperties).toMatchObject(textPropertiesA);
    expect(pageEntities[2].textProperties).toMatchObject(textPropertiesB);
    expect(pageEntities[3].textProperties).toMatchObject(textPropertiesC);
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
        validSchemaInput.description
      );
    });

    it("enforces uniqueness of schema name in account", async () => {
      await expect(
        client.createEntityType({
          accountId: existingUser.accountId,
          ...validSchemaInput,
        })
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
        })
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
        })
      ).rejects.toThrowError(/testField must be object,boolean/);

      await expect(
        client.createEntityType({
          accountId: existingUser.accountId,
          schema: {
            invalidKeyword: true,
          },
          name: schemaName + 3,
        })
      ).rejects.toThrowError(/unknown keyword/);
    });
  });
});
