import { SystemType } from "@hashintel/hash-api/src/types/entityTypes";
import {
  generateSchema$id,
  JSON_SCHEMA_VERSION,
} from "@hashintel/hash-api/src/model/entityType.util";
import generatedIds from "./generatedIds.json";

const systemAccount = generatedIds.orgs.__system__;

/**
 * Generate the URI for a schema.
 * Use relative for $refs to other schemas in the same system.
 */
const schema$id = (name: SystemType, relative: boolean = false) =>
  generateSchema$id(
    systemAccount.fixedId,
    generatedIds.types[name].fixedId,
    relative,
  );

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
    description: "An organization account in a HASH instance.",
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
          $ref: schema$id("OrgMembership", true),
        },
      },
    },
    required: ["shortname", "memberships"],
  },
  User: {
    description: "A user with an account in a HASH instance.",
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
          $ref: schema$id("OrgMembership", true),
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
        $ref: schema$id("User", true),
      },
      org: {
        description:
          "A reference to the organization associated with the membership.",
        $ref: schema$id("Org", true),
      },
      responsibility: {
        description: "The responsibility of the user in the organization",
        type: "string",
      },
    },
    required: ["org", "user", "responsibility"],
  },
  Page: {
    title: "Page",
    description: "A page of content.",
    type: "object",
    properties: {
      archived: {
        type: "boolean",
        description: "Whether or not the page has been archived",
      },
      contents: {
        type: "array",
        description:
          "An ordered list of the blocks making up the contents of this page",
        items: {
          $ref: schema$id("Block", true),
        },
      },
      summary: {
        type: "string",
        description: "An abstract or summary of the page",
      },
      title: {
        type: "string",
        description: "The title of the page",
      },
    },
    required: ["title", "contents"],
  },
  Block: {
    title: "Block",
    description:
      "A block of content, for displaying or editing a data structure.",
    type: "object",
    properties: {
      componentId: {
        type: "string",
        description:
          "The identifier (e.g. a URI) for the component that will render the data.",
      },
      entity: {
        type: "object",
        description: "The data entity to display or edit",
      },
    },
    required: ["componentId", "entity"],
  },
};

export const entityTypeJson = (name: SystemType) =>
  JSON.stringify({
    $schema: JSON_SCHEMA_VERSION,
    $id: schema$id(name),
    title: name,
    type: "object",
    ...systemTypeSchemas[name],
  });
