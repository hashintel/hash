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
    ).resolves.toBeUndefined();
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
    ).resolves.toBeUndefined();
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
    ).resolves.toBeUndefined();
  });
});
