import { Subgraph } from "@hashintel/subgraph/src/types";
import { GraphApi } from "@hashintel/hash-graph-client";

import { merge } from "lodash";
import {
  EntityType,
  PropertyType,
  VersionedUri,
} from "@blockprotocol/type-system-node";

export const mergeSubgraphs = (subgraphs: Subgraph[]): Subgraph => {
  return subgraphs.reduce((accumulate, next) => {
    return merge(accumulate, next);
  });
};

const PROPERTY_TYPES: PropertyType[] = [
  {
    kind: "propertyType",
    $id: "http://localhost:3000/@alice/types/property-type/address-line-1/v/1",
    title: "Address Line 1",
    oneOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      },
    ],
  },
  {
    kind: "propertyType",
    $id: "http://localhost:3000/@alice/types/property-type/age/v/1",
    title: "Age",
    oneOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
      },
    ],
  },
  {
    kind: "propertyType",
    $id: "http://localhost:3000/@alice/types/property-type/blurb/v/1",
    title: "Blurb",
    oneOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      },
    ],
  },
  {
    kind: "propertyType",
    $id: "http://localhost:3000/@alice/types/property-type/city/v/1",
    title: "City",
    oneOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      },
    ],
  },
  {
    kind: "propertyType",
    $id: "http://localhost:3000/@alice/types/property-type/email/v/1",
    title: "Email",
    oneOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      },
    ],
  },
  {
    kind: "propertyType",
    $id: "http://localhost:3000/@alice/types/property-type/phone-number/v/1",
    title: "Phone Number",
    oneOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      },
    ],
  },
  {
    kind: "propertyType",
    $id: "http://localhost:3000/@alice/types/property-type/contact-information/v/1",
    title: "Contact Information",
    oneOf: [
      {
        type: "object",
        properties: {
          "http://localhost:3000/@alice/types/property-type/email/": {
            $ref: "http://localhost:3000/@alice/types/property-type/email/v/1",
          },
          "http://localhost:3000/@alice/types/property-type/phone-number/": {
            $ref: "http://localhost:3000/@alice/types/property-type/phone-number/v/1",
          },
        },
        required: ["http://localhost:3000/@alice/types/property-type/email/"],
      },
    ],
  },
  {
    kind: "propertyType",
    $id: "http://localhost:3000/@alice/types/property-type/contrived-property/v/1",
    title: "Contrived Property",
    oneOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
      },
      {
        type: "array",
        items: {
          oneOf: [
            {
              $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
            },
          ],
        },
        maxItems: 4,
      },
    ],
  },
  {
    kind: "propertyType",
    $id: "http://localhost:3000/@alice/types/property-type/favorite-film/v/1",
    title: "Favorite Film",
    oneOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      },
    ],
  },
  {
    kind: "propertyType",
    $id: "http://localhost:3000/@alice/types/property-type/favorite-quote/v/1",
    title: "Favorite Quote",
    oneOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      },
    ],
  },
  {
    kind: "propertyType",
    $id: "http://localhost:3000/@alice/types/property-type/favorite-song/v/1",
    title: "Favorite Song",
    oneOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      },
    ],
  },
  {
    kind: "propertyType",
    $id: "http://localhost:3000/@alice/types/property-type/hobby/v/1",
    title: "Hobby",
    oneOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      },
    ],
  },
  {
    kind: "propertyType",
    $id: "http://localhost:3000/@alice/types/property-type/postcode/v/1",
    title: "Postcode",
    oneOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      },
    ],
  },
];

const ENTITY_TYPES: EntityType[] = [
  {
    kind: "entityType",
    $id: "http://localhost:3000/@alice/types/entity-type/acquaintance-of/v/1",
    type: "object",
    title: "Acquaintance Of",
    description: "Someone who is known but not a close friend",
    allOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1",
      },
    ],
    properties: {},
  },
  {
    kind: "entityType",
    $id: "http://localhost:3000/@alice/types/entity-type/contains/v/1",
    type: "object",
    title: "Contains",
    description: "Have or hold within",
    allOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1",
      },
    ],
    properties: {},
  },
  {
    kind: "entityType",
    $id: "http://localhost:3000/@alice/types/entity-type/friend-of/v/1",
    type: "object",
    title: "Friend of",
    description: "Someone who has a shared bond of mutual affection",
    allOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1",
      },
    ],
    properties: {},
  },
  {
    kind: "entityType",
    $id: "http://localhost:3000/@alice/types/entity-type/located-at/v/1",
    type: "object",
    title: "Located At",
    description: "Residing at a specific position",
    allOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1",
      },
    ],
    properties: {},
  },
  {
    kind: "entityType",
    $id: "http://localhost:3000/@alice/types/entity-type/owns/v/1",
    type: "object",
    title: "Owns",
    description: "Have (something) as one's own; possess",
    allOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1",
      },
    ],
    properties: {},
  },
  {
    kind: "entityType",
    $id: "http://localhost:3000/@alice/types/entity-type/submitted-by/v/1",
    type: "object",
    title: "Submitted By",
    description: "Suggested, proposed, or presented by",
    allOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1",
      },
    ],
    properties: {},
  },
  {
    kind: "entityType",
    $id: "http://localhost:3000/@alice/types/entity-type/tenant/v/1",
    type: "object",
    title: "Tenant",
    description: "Someone who occupies land or property rented from a landlord",
    allOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1",
      },
    ],
    properties: {},
  },
  {
    kind: "entityType",
    $id: "http://localhost:3000/@alice/types/entity-type/written-by/v/1",
    type: "object",
    title: "Written By",
    description: "Written or composed by",
    allOf: [
      {
        $ref: "https://blockprotocol.org/@blockprotocol/types/entity-type/link/v/1",
      },
    ],
    properties: {},
  },
  {
    kind: "entityType",
    $id: "http://localhost:3000/@alice/types/entity-type/block/v/1",
    title: "Block",
    type: "object",
    properties: {
      "http://localhost:3000/@alice/types/property-type/name/": {
        $ref: "http://localhost:3000/@alice/types/property-type/name/v/1",
      },
    },
    required: ["http://localhost:3000/@alice/types/property-type/name/"],
  },
  {
    kind: "entityType",
    $id: "http://localhost:3000/@alice/types/entity-type/uk-address/v/1",
    type: "object",
    title: "UK Address",
    properties: {
      "http://localhost:3000/@alice/types/property-type/address-line-1/": {
        $ref: "http://localhost:3000/@alice/types/property-type/address-line-1/v/1",
      },
      "http://localhost:3000/@alice/types/property-type/postcode/": {
        $ref: "http://localhost:3000/@alice/types/property-type/postcode/v/1",
      },
      "http://localhost:3000/@alice/types/property-type/city/": {
        $ref: "http://localhost:3000/@alice/types/property-type/city/v/1",
      },
    },
    required: [
      "http://localhost:3000/@alice/types/property-type/address-line-1/",
      "http://localhost:3000/@alice/types/property-type/postcode/",
      "http://localhost:3000/@alice/types/property-type/city/",
    ],
  },
  {
    kind: "entityType",
    $id: "http://localhost:3000/@alice/types/entity-type/building/v/1",
    type: "object",
    title: "Building",
    properties: {},
    links: {
      "http://localhost:3000/@alice/types/entity-type/located-at/v/1": {
        type: "array",
        items: {
          oneOf: [
            {
              $ref: "http://localhost:3000/@alice/types/entity-type/uk-address/v/1",
            },
          ],
        },
        ordered: false,
      },
      "http://localhost:3000/@alice/types/entity-type/tenant/v/1": {
        type: "array",
        items: {
          oneOf: [
            {
              $ref: "http://localhost:3000/@alice/types/entity-type/person/v/1",
            },
          ],
        },
        ordered: false,
      },
    },
  },
  {
    kind: "entityType",
    $id: "http://localhost:3000/@alice/types/entity-type/organization/v/1",
    type: "object",
    title: "Organization",
    properties: {
      "http://localhost:3000/@alice/types/property-type/name/": {
        $ref: "http://localhost:3000/@alice/types/property-type/name/v/1",
      },
    },
  },
  {
    kind: "entityType",
    $id: "http://localhost:3000/@alice/types/entity-type/person/v/1",
    type: "object",
    title: "Person",
    properties: {
      "http://localhost:3000/@alice/types/property-type/name/": {
        $ref: "http://localhost:3000/@alice/types/property-type/name/v/1",
      },
    },
    links: {
      "http://localhost:3000/@alice/types/entity-type/friend-of/v/1": {
        type: "array",
        items: {
          oneOf: [
            {
              $ref: "http://localhost:3000/@alice/types/entity-type/person/v/1",
            },
          ],
        },
        ordered: false,
      },
    },
  },
  {
    kind: "entityType",
    $id: "http://localhost:3000/@alice/types/entity-type/song/v/1",
    type: "object",
    title: "Song",
    properties: {
      "http://localhost:3000/@alice/types/property-type/name/": {
        $ref: "http://localhost:3000/@alice/types/property-type/name/v/1",
      },
    },
  },
];

const ENTITIES: Record<VersionedUri, object[][]> = {
  "http://localhost:3000/@alice/types/entity-type/uk-address/v/1": [
    [
      {
        "http://localhost:3000/@alice/types/property-type/address-line-1/":
          "Buckingham Palace",
        "http://localhost:3000/@alice/types/property-type/postcode/":
          "SW1A 1AA",
        "http://localhost:3000/@alice/types/property-type/city/": "London",
      },
    ],
  ],
  "http://localhost:3000/@alice/types/entity-type/block/v/1": [
    [
      {
        "http://localhost:3000/@alice/types/property-type/name/": "Text",
      },
    ],
  ],
  "http://localhost:3000/@alice/types/entity-type/organization/v/1": [
    [
      {
        "http://localhost:3000/@alice/types/property-type/name/": "HASH, Ltd",
      },
    ],
  ],
  "http://localhost:3000/@alice/types/entity-type/person/v/1": [
    [
      {
        "http://localhost:3000/@alice/types/property-type/name/": "Alice",
      },
    ],
    [
      {
        "http://localhost:3000/@alice/types/property-type/name/": "Bob",
      },
    ],
    [
      {
        "http://localhost:3000/@alice/types/property-type/name/": "Charles",
      },
    ],
  ],
};

export const seed = async (graphApi: GraphApi) => {
  const accountId = (await graphApi.createAccountId()).data;

  for (const propertyType of PROPERTY_TYPES) {
    await graphApi
      .createPropertyType({
        actorId: accountId,
        ownedById: accountId,
        schema: propertyType,
      })
      .catch((error: any) => {
        if (error.response?.status !== 409) {
          throw error;
        }
      });
  }

  for (const entityType of ENTITY_TYPES) {
    await graphApi
      .createEntityType({
        actorId: accountId,
        ownedById: accountId,
        schema: entityType,
      })
      .catch((error: any) => {
        if (error.response?.status !== 409) {
          throw new Error(`${error}\n${error.response}`);
        }
      });
  }

  for (const [entityTypeId, entitiesByType] of Object.entries(ENTITIES)) {
    let entityId;
    for (const entityEditions of entitiesByType) {
      for (const [index, entity] of entityEditions.entries()) {
        if (index === 0) {
          entityId = (
            await graphApi
              .createEntity({
                actorId: accountId,
                ownedById: accountId,
                entity,
                entityTypeId,
              })
              .catch((error: any) => {
                if (error.response?.status !== 409) {
                  throw error;
                }
              })
          )?.data.identifier.entityIdentifier;
          if (!entityId) {
            throw Error("failed to create entity");
          }
        } else {
          await graphApi
            .updateEntity({
              actorId: accountId,
              entityIdentifier: entityId as string,
              entity,
              entityTypeId,
            })
            .catch((error: any) => {
              if (error.response?.status !== 409) {
                throw error;
              }
            });
        }
      }
    }
  }
};
