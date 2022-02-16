import { JsonSchemaCompiler } from "./jsonSchema";

const jsonSchemaCompiler = new JsonSchemaCompiler(async (_url: string) => ({}));

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
    await jsonSchemaCompiler.prevalidateProperties(schema);
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
      jsonSchemaCompiler.prevalidateProperties(schema),
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
      jsonSchemaCompiler.prevalidateProperties(schema),
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
    };
    await expect(
      jsonSchemaCompiler.prevalidateProperties(schema),
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
    };
    await expect(
      jsonSchemaCompiler.prevalidateProperties(schema),
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
    };
    await expect(
      jsonSchemaCompiler.prevalidateProperties(schema),
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
      jsonSchemaCompiler.prevalidateProperties(schema),
    ).resolves.toBeDefined();
  });
});

describe("destructing json schemas", () => {
  it("can handle json schemas without inheritance", async () => {
    const schema = {
      $id: "$person",
      type: "object",
      properties: {
        name: { type: "string" },
        age: { type: "string" },
      },
    };

    const result = await jsonSchemaCompiler.deconstructedJsonSchema(schema);

    expect(result.id).toEqual("$person");
    expect(result.properties).toEqual([
      { name: "name", content: { type: "string" } },
      { name: "age", content: { type: "string" } },
    ]);
    expect(result.parentSchemas).toHaveLength(0);
  });

  it("can handle json schemas with one level of inheritance", async () => {
    const schema = {
      $id: "$doctor",
      type: "object",
      allOf: [
        {
          $id: "$medicalProfessional",
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "string" },
            field: { type: "string" },
          },
        },
      ],
      properties: {
        licenseId: { type: "string" },
        age: { type: "string" },
      },
    };

    const result = await jsonSchemaCompiler.deconstructedJsonSchema(schema);

    expect(result.id).toEqual("$doctor");
    expect(result.properties).toEqual([
      { name: "licenseId", content: { type: "string" } },
      { name: "age", content: { type: "string" } },
    ]);

    expect(result.parentSchemas).toHaveLength(1);

    expect(result.parentSchemas).toContainEqual({
      id: "$medicalProfessional",
      properties: [
        { name: "name", content: { type: "string" } },
        { name: "age", content: { type: "string" } },
        { name: "field", content: { type: "string" } },
      ],
      parents: [],
    });
  });

  it("can handle json schemas with more levels of inheritance", async () => {
    const schema = {
      $id: "$doctor",
      type: "object",
      allOf: [
        {
          $id: "$medicalProfessional",
          type: "object",
          allOf: [
            {
              $id: "$person",
              type: "object",
              properties: {
                name: { type: "string" },
                age: { type: "string" },
              },
            },
          ],
          properties: {
            field: { type: "string" },
          },
        },
      ],
      properties: {
        licenseId: { type: "string" },
        age: { type: "string" },
      },
    };

    const result = await jsonSchemaCompiler.deconstructedJsonSchema(schema);

    expect(result.id).toEqual("$doctor");
    expect(result.properties).toEqual([
      { name: "licenseId", content: { type: "string" } },
      { name: "age", content: { type: "string" } },
    ]);

    expect(result.parentSchemas).toHaveLength(2);
    expect(result.parentSchemas).toContainEqual({
      id: "$medicalProfessional",
      properties: [{ name: "field", content: { type: "string" } }],
      parents: ["$person"],
    });

    expect(result.parentSchemas).toContainEqual({
      id: "$person",
      properties: [
        { name: "name", content: { type: "string" } },
        { name: "age", content: { type: "string" } },
      ],
      parents: [],
    });
  });

  it("disallows recursive deconstruction/duplicate names", async () => {
    const schema = {
      $id: "schema",
      definitions: {
        person: {
          type: "object",
          properties: {},
        },
        medicalProfessional: {
          type: "object",
          allOf: [{ $ref: "#/definitions/person" }],
          properties: {},
        },
        doctor: {
          type: "object",
          allOf: [
            { $ref: "#/definitions/medicalProfessional" },
            { $ref: "#/definitions/doctor" },
          ],

          properties: {},
        },
      },

      type: "object",
      allOf: [{ $ref: "#/definitions/doctor" }],
      properties: {},
    };

    await expect(
      jsonSchemaCompiler.deconstructedJsonSchema(schema),
    ).rejects.toThrowError(/circular \$ref pointer found/i);
  });
});
