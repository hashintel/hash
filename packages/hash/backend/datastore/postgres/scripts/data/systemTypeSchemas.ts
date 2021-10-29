import {
  SYSTEM_ACCOUNT_SHORTNAME,
  SYSTEM_TYPE,
  FRONTEND_URL,
} from "../../../../src/lib/config";
import generatedIds from "./generatedIds.json";

const systemAccount = generatedIds.orgs[SYSTEM_ACCOUNT_SHORTNAME];

const schemaId = (name: SYSTEM_TYPE) =>
  `${FRONTEND_URL}/${systemAccount.fixedId}/types/${generatedIds.types[name].fixedId}`;

const shortnameConstraints = {
  minLength: 4,
  maxLength: 24,
  type: "string",
};

type SchemaProperty = {
  type?: string;
  $ref?: string;
  description?: string;
  items?: SchemaProperty;
  properties?: Record<string, SchemaProperty>;
};

type PartialSchema = SchemaProperty & {
  required: string[];
  $defs?: Record<string, PartialSchema>;
};
// @todo add the remaining schemas for each system type
//    the EntityType schema will probably be the general purpose JSON meta schema
//    https://json-schema.org/specification.html
const systemTypeSchemas: {
  [key: string]: PartialSchema;
} = {
  Org: {
    description: "An organization account in a HASH.dev instance.",
    properties: {
      shortname: {
        ...shortnameConstraints,
        description: "A unique slug for the organization.",
      },
      name: {
        type: "string",
        description: "A display name for the organization.",
      },
    },
    required: ["shortname"],
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
              description:
                "Whether this email address is the primary one for the user",
              type: "boolean",
            },
            verified: {
              description: "Whether this email address has been verified",
              type: "boolean",
            },
          },
        },
      },
      memberOf: {
        description: "Details of org membership(s).",
        type: "array",
        items: {
          $ref: "#/$defs/orgMembership",
        },
      },
      shortname: {
        ...shortnameConstraints,
        description: "A unique slug for the user.",
      },
      preferredName: {
        description: "The name which the user prefers to go by",
        type: "string",
      },
    },
    required: ["emails"],

    $defs: {
      orgMembership: {
        description: "Metadata on membership of an org.",
        type: "object",
        properties: {
          org: {
            description: "A reference to the org itself.",
            $ref: schemaId("Org"),
          },
          role: {
            description: "The role of the user in the org",
            type: "string",
          },
        },
        required: ["org", "role"],
      },
    },
  },
};

export const entityTypeJson = (name: SYSTEM_TYPE) =>
  JSON.stringify({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: schemaId(name),
    title: name,
    type: "object",
    ...systemTypeSchemas[name],
  });
