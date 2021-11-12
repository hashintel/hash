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
  title?: string;
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
      memberships: {
        description: "The membership(s) of the organization.",
        type: "array",
        items: {
          $ref: schemaId("OrgMembership"),
        },
      },
    },
    required: ["shortname", "memberships"],
  },
  User: {
    description: "A user with an account in a HASH.dev instance.",
    properties: {
      emails: {
        type: "array",
        description: "The email address(es) associated with a user",
        items: {
          $ref: "#/$defs/Emails",
        },
      },
      memberOf: {
        description: "The organization membership(s) of the user.",
        type: "array",
        items: {
          $ref: schemaId("OrgMembership"),
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
    required: ["emails", "memberOf"],

    $defs: {
      Emails: {
        title: "Email",
        type: "object",
        description: "Information on a email address.",
        properties: {
          address: {
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
        required: ["address", "primary", "verified"],
      },
    },
  },
  OrgMembership: {
    title: "OrgMembership",
    description: "The membership of a user at an organization.",
    type: "object",
    properties: {
      user: {
        description: "A reference to the user associated with the membership.",
        $ref: schemaId("User"),
      },
      org: {
        description:
          "A reference to the organization associated with the membership.",
        $ref: schemaId("Org"),
      },
      responsibility: {
        description: "The responsibility of the user in the organization",
        type: "string",
      },
    },
    required: ["org", "user", "responsibility"],
  },
};

export const entityTypeJson = (name: SYSTEM_TYPE) =>
  JSON.stringify({
    $schema: "https://json-schema.org/draft/2019-09/schema",
    $id: schemaId(name),
    title: name,
    type: "object",
    ...systemTypeSchemas[name],
  });
