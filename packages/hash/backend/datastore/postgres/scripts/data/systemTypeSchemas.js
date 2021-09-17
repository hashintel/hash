const generatedIds = require("./generatedIds.json");
const { SYSTEM_ACCOUNT_NAME } = require("../../../../src/lib/config");

const systemAccount = generatedIds.orgs[SYSTEM_ACCOUNT_NAME];

const schemaId = (name) => `https://hash.ai/${systemAccount.fixedId}/types/${generatedIds.types[name].fixedId}`;

const shortnameConstraints = {
  minLength: 4,
  maxLength: 24,
  type: "string",
};

// @todo add the remaining schemas for each system type
//    the EntityType schema will probably be the general purpose JSON meta schema
//    https://json-schema.org/specification.html
const systemTypeSchemas = {
  Org: {
    description: "An organization account in a HASH.dev instance.",
    properties: {
      shortname: {
        ...shortnameConstraints,
        description: "A unique slug for the organization."
      },
      name: {
        type: "string",
        description: "A display name for the organization."
      }
    },
    required: ["shortname"]
  },
  User: {
    description: "A user with an account in a HASH.dev instance.",
    properties: {
      emails: {
        type: "array",
        description: "The email address(es) associated with a user",
        items: {
          type: "object",
          description: "Information on a email address.",
          properties: {
            email: {
              description: "The email address itself",
              type: "string",
            },
            primary: {
              description: "Whether this email address is the primary one for the user",
              type: "boolean"
            },
            verified: {
              description: "Whether this email address has been verified",
              type: "boolean"
            }
          }
        }
      },
      memberOf: {
        $ref: schemaId("Org")
      },
      shortname: {
        ...shortnameConstraints,
        description: "A unique slug for the user."
      },
      preferredName: {
        description: "The name which the user prefers to go by",
        type: "string",
      }
    },
    required: ["emails"]
  }
};

const entityTypeJson = (name) => JSON.stringify({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: schemaId(name),
  title: name,
  type: "object",
  ...systemTypeSchemas[name],
});

module.exports = {
  entityTypeJson,
};