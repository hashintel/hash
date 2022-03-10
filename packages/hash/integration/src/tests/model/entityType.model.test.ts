import "../loadTestEnv";
import { PostgresAdapter } from "@hashintel/hash-api/src/db";
import { EntityType, User } from "@hashintel/hash-api/src/model";
import { WayToUseHash } from "@hashintel/hash-api/src/graphql/apiTypes.gen";
import { Logger } from "@hashintel/hash-backend-utils/logger";

import { recreateDbAndRunSchemaMigrations } from "../setup";

const logger = new Logger({
  mode: "dev",
  level: "debug",
  serviceName: "integration-tests",
});

let db: PostgresAdapter;

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

type Ref = { $ref?: string };

describe("EntityType model class", () => {
  let existingUser: User;

  beforeAll(async () => {
    existingUser = await User.createUser(db, {
      shortname: "test-user",
      preferredName: "Alice",
      emails: [{ address: "alice@hash.test", primary: true, verified: true }],
      infoProvidedAtSignup: { usingHow: WayToUseHash.ByThemselves },
    });
  });

  const personSchema = {
    type: "object",
    properties: {
      name: { type: "string" },
      age: { type: "number" },
      updatedAt: { type: "string", format: "date-time" },
      createdAt: { type: "string", format: "date-time" },
    },
  };

  it("can create an EntityType with a JSON Schema", async () => {
    const created = await EntityType.create(db, {
      accountId: existingUser.accountId,
      createdByAccountId: existingUser.accountId,
      name: "Person1",
      schema: personSchema,
    });

    const fetched = await EntityType.getEntityType(db, {
      entityTypeId: created.entityId,
    });

    expect(created.properties).toEqual(fetched!.properties);
  });

  const medicalProfessionalSchema = (allOf: Ref[]) => ({
    type: "object",
    allOf,
    properties: {
      licenseId: { type: "string" },
    },
  });

  it("can create an EntityType, extending an existing JSON Schema", async () => {
    const personCreated = await EntityType.create(db, {
      accountId: existingUser.accountId,
      createdByAccountId: existingUser.accountId,
      name: "Person2",
      schema: personSchema,
    });

    const medicalProfCreated = await EntityType.create(db, {
      accountId: existingUser.accountId,
      createdByAccountId: existingUser.accountId,
      name: "MedicalProfessional2",
      schema: medicalProfessionalSchema([
        { $ref: personCreated.schema$idWithFrontendDomain },
      ]),
    });

    const fetched = await EntityType.getEntityType(db, {
      entityTypeId: medicalProfCreated.entityId,
    });

    const parentSchemas = await fetched!.getParentEntityTypes(db);
    const allParents = await fetched!.getInheritanceChain(db);

    expect(parentSchemas).toHaveLength(1);
    expect(allParents).toHaveLength(1);
  });

  const paramedicSchema = (allOf: Ref[]) => ({
    type: "object",
    allOf,
    properties: {
      someField: { type: "string" },
    },
  });

  it("can create an EntityType, creating 3-levels of inheritance", async () => {
    const personCreated = await EntityType.create(db, {
      accountId: existingUser.accountId,
      createdByAccountId: existingUser.accountId,
      name: "Person3",
      schema: personSchema,
    });

    const medicalProfCreated = await EntityType.create(db, {
      accountId: existingUser.accountId,
      createdByAccountId: existingUser.accountId,
      name: "MedicalProfessional3",
      schema: medicalProfessionalSchema([
        { $ref: personCreated.schema$idWithFrontendDomain },
      ]),
    });

    const paramedicCreated = await EntityType.create(db, {
      accountId: existingUser.accountId,
      createdByAccountId: existingUser.accountId,
      name: "Paramedic",
      schema: paramedicSchema([
        { $ref: medicalProfCreated.schema$idWithFrontendDomain },
      ]),
    });

    const fetched = await EntityType.getEntityType(db, {
      entityTypeId: paramedicCreated.entityId,
    });

    const parentSchemas = await fetched!.getParentEntityTypes(db);
    const allParents = await fetched!.getInheritanceChain(db);

    expect(parentSchemas).toHaveLength(1);
    expect(allParents).toHaveLength(2);
  });

  describe("compatibility validation", () => {
    it("allows inheritance that do not re-write keys", async () => {
      const schema = {
        type: "object",
        allOf: [
          {
            type: "object",
            properties: {
              name: { type: "string" },
              age: { type: "number" },
            },
          },
        ],
        properties: {
          id: { type: "string" },
          updatedAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
        },
      };

      await expect(
        EntityType.create(db, {
          accountId: existingUser.accountId,
          createdByAccountId: existingUser.accountId,
          name: "Compatability1",
          schema,
        }),
      ).resolves.toBeDefined();
      // no error should be thrown
    });

    it("disallows overwriting incompatible, inheriting fields from props", async () => {
      const schema = {
        type: "object",
        allOf: [
          {
            type: "object",
            properties: {
              name: { type: "string" },
              age: { type: "string" },
            },
          },
        ],
        properties: {
          id: { type: "string" },
          age: { type: "number" },
          updatedAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
        },
      };

      await expect(
        EntityType.create(db, {
          accountId: existingUser.accountId,
          createdByAccountId: existingUser.accountId,
          name: "Compatability2",
          schema,
        }),
      ).rejects.toThrowError(
        /Type mismatch on "age". Got "string" expected "number"/i,
      );
    });
    it("allows overwriting compatible, inheriting fields from props", async () => {
      const schema = {
        type: "object",
        allOf: [
          {
            type: "object",
            properties: {
              name: { type: "string" },
              age: { type: "string" },
            },
          },
        ],
        properties: {
          id: { type: "string" },
          age: { type: "string" },
          updatedAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
        },
      };

      await expect(
        EntityType.create(db, {
          accountId: existingUser.accountId,
          createdByAccountId: existingUser.accountId,
          name: "Compatability3",
          schema,
        }),
      ).resolves.toBeDefined();
    });

    it("disallows overwriting incompatible, inheriting fields from other parent types", async () => {
      const schema = {
        type: "object",
        allOf: [
          {
            type: "object",
            properties: {
              name: { type: "string" },
              age: { type: "string" },
            },
          },
          {
            type: "object",
            properties: {
              age: { type: "number" },
            },
          },
        ],
        properties: {
          id: { type: "string" },
          updatedAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
        },
      } as any;

      await expect(
        EntityType.create(db, {
          accountId: existingUser.accountId,
          createdByAccountId: existingUser.accountId,
          name: "Compatability4",
          schema,
        }),
      ).rejects.toThrowError(
        /Type mismatch on "age". Got "number" expected "string"/i,
      );
    });

    it("allows overwriting compatible, inheriting fields from other parent types", async () => {
      const schema = {
        type: "object",
        allOf: [
          {
            type: "object",
            properties: {
              name: { type: "string" },
              age: { type: "string" },
            },
          },
          {
            type: "object",
            properties: {
              age: { type: "string" },
            },
          },
        ],
        properties: {
          id: { type: "string" },
          updatedAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
        },
      } as any;

      await expect(
        EntityType.create(db, {
          accountId: existingUser.accountId,
          createdByAccountId: existingUser.accountId,
          name: "Compatability5",
          schema,
        }),
      ).resolves.toBeDefined();
    });

    it("disallows overwriting incompatible, inheriting fields from nested parent types", async () => {
      const schema = {
        type: "object",
        allOf: [
          {
            type: "object",
            allOf: [
              {
                type: "object",
                properties: {
                  name: { type: "string" },
                  height: { type: "string" },
                },
              },
            ],
            properties: {
              age: { type: "number" },
            },
          },
        ],
        properties: {
          id: { type: "string" },
          height: { type: "number" },
          updatedAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
        },
      } as any;

      await expect(
        EntityType.create(db, {
          accountId: existingUser.accountId,
          createdByAccountId: existingUser.accountId,
          name: "Compatability6",
          schema,
        }),
      ).rejects.toThrowError(
        /Type mismatch on "height". Got "string" expected "number"/i,
      );
    });

    it("allows overwriting compatible, inheriting fields from nested parent types", async () => {
      const schema = {
        type: "object",
        allOf: [
          {
            type: "object",
            allOf: [
              {
                type: "object",
                properties: {
                  name: { type: "string" },
                  height: { type: "string" },
                },
              },
            ],
            properties: {
              age: { type: "number" },
            },
          },
        ],
        properties: {
          id: { type: "string" },
          lefthanded: { type: "boolean" },
          updatedAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
        },
      };

      await expect(
        EntityType.create(db, {
          accountId: existingUser.accountId,
          createdByAccountId: existingUser.accountId,
          name: "Compatability7",
          schema,
        }),
      ).resolves.toBeDefined();
    });
  });
});

afterAll(async () => {
  await db.close();
});
