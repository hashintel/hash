/* eslint-disable no-console */
import z from "zod";
import { convertJsonSchemaToZod } from "zod-from-json-schema";

import { dereferencedPersonSchema } from "../fixtures/entity-schemas/person";

type JZSchema = Parameters<typeof convertJsonSchemaToZod>[0];

// Define a JSON Schema with advanced features
const jsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    name: { type: "string", minLength: 2, maxLength: 50 },
    age: { type: "integer", minimum: 0, maximum: 120 },
    email: {
      type: "string",
      pattern: "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$",
    },
    tags: {
      type: "array",
      items: { type: "string" },
      uniqueItems: true,
      minItems: 1,
      maxItems: 10,
      contains: { enum: ["user", "admin", "guest"] },
    },
    coordinates: {
      type: "array",
      prefixItems: [
        { type: "number", minimum: -90, maximum: 90 }, // latitude
        { type: "number", minimum: -180, maximum: 180 }, // longitude
      ],
      items: false, // No additional items allowed
    },
    score: { type: "number", multipleOf: 0.5, minimum: 0, maximum: 100 },
  },
  required: ["name", "email"],
  additionalProperties: false,
  minProperties: 2,
  maxProperties: 10,
} satisfies JZSchema;

// Convert JSON Schema to Zod schema
const zodSchema = convertJsonSchemaToZod(jsonSchema);

// Use the Zod schema to validate data
try {
  const validData = zodSchema.parse({
    name: "John Doe",
    email: "john@example.com",
    age: 30,
    tags: ["user", "premium", "admin"], // Contains required "admin" role
    coordinates: [37.7749, -122.4194], // San Francisco lat/lng
    score: 87.5, // Multiple of 0.5
  });
  console.log("Valid data:", validData);
} catch (error) {
  console.error("Validation error:", error);
}

// Convert Person Schema
const zodPersonSchema = convertJsonSchemaToZod(
  dereferencedPersonSchema.schema as unknown as JZSchema,
);

// Use the Zod schema to validate data
try {
  const validData = zodPersonSchema.parse({
    name: "John Doe",
    email: "john@example.com",
    bio: "A software developer from San Francisco.",
    "website-url": "https://johndoe.com",
    location: "San Francisco, CA",
    "date-of-birth": "1990-01-01",
    "job-title": "Software Engineer",
    // Uncomment below to test additional properties
    // age: 30,
    // tags: ['user', 'premium', 'admin'], // Contains required "admin" role
    // coordinates: [37.7749, -122.4194], // San Francisco lat/lng
    // score: 87.5, // Multiple of 0.5
  });
  console.log("Valid data:", validData);
} catch (error) {
  console.error("Validation error:", error);
}

z.toJSONSchema(zodPersonSchema); // ?
z.toJSONSchema(zodPersonSchema.array()); // ?
z.toJSONSchema(
  z.object({ foo: z.string(), bar: z.number(), web: z.httpUrl() }).array(),
); // ?
