import type { Subgraph as ApiClientSubgraph } from "@local/hash-graph-client";
import type { Subgraph } from "@local/hash-subgraph";

import { dereferenceEntityType } from "./dereference-entity-type";

const testSubgraph: Pick<ApiClientSubgraph, "edges" | "roots" | "vertices"> = {
  edges: {
    "https://hash.ai/@test/types/property-type/mixed-array/": {
      "3": [
        {
          kind: "CONSTRAINS_PROPERTIES_ON",
          reversed: false,
          rightEndpoint: {
            baseId: "https://hash.ai/@hash/types/property-type/expired-at/",
            revisionId: 1,
          },
        },
        {
          kind: "CONSTRAINS_PROPERTIES_ON",
          reversed: false,
          rightEndpoint: {
            baseId:
              "https://hash.ai/@hash/types/property-type/organization-name/",
            revisionId: 1,
          },
        },
        {
          kind: "CONSTRAINS_PROPERTIES_ON",
          reversed: false,
          rightEndpoint: {
            baseId: "https://hash.ai/@hash/types/property-type/archived/",
            revisionId: 1,
          },
        },
        {
          kind: "CONSTRAINS_VALUES_ON",
          reversed: false,
          rightEndpoint: {
            baseId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/",
            revisionId: 1,
          },
        },
        {
          kind: "CONSTRAINS_VALUES_ON",
          reversed: false,
          rightEndpoint: {
            baseId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/number/",
            revisionId: 1,
          },
        },
      ],
    },
    "https://hash.ai/@d/types/property-type/notes/": {
      "1": [
        {
          kind: "CONSTRAINS_VALUES_ON",
          reversed: false,
          rightEndpoint: {
            baseId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/",
            revisionId: 1,
          },
        },
      ],
    },
    "https://hash.ai/@hash/types/property-type/deleted-at/": {
      "1": [
        {
          kind: "CONSTRAINS_VALUES_ON",
          reversed: false,
          rightEndpoint: {
            baseId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/",
            revisionId: 1,
          },
        },
      ],
    },
    "https://hash.ai/@test/types/property-type/notes-and-summary/": {
      "1": [
        {
          kind: "CONSTRAINS_PROPERTIES_ON",
          reversed: false,
          rightEndpoint: {
            baseId: "https://hash.ai/@d/types/property-type/notes/",
            revisionId: 1,
          },
        },
        {
          kind: "CONSTRAINS_PROPERTIES_ON",
          reversed: false,
          rightEndpoint: {
            baseId: "https://hash.ai/@hash/types/property-type/summary/",
            revisionId: 1,
          },
        },
      ],
    },
    "https://hash.ai/@test/types/entity-type/property-values-demo/": {
      "4": [
        {
          kind: "CONSTRAINS_PROPERTIES_ON",
          reversed: false,
          rightEndpoint: {
            baseId: "https://hash.ai/@hash/types/property-type/archived/",
            revisionId: 1,
          },
        },
        {
          kind: "CONSTRAINS_PROPERTIES_ON",
          reversed: false,
          rightEndpoint: {
            baseId: "https://hash.ai/@hash/types/property-type/deleted-at/",
            revisionId: 1,
          },
        },
        {
          kind: "CONSTRAINS_PROPERTIES_ON",
          reversed: false,
          rightEndpoint: {
            baseId: "https://hash.ai/@test/types/property-type/mixed-array/",
            revisionId: 3,
          },
        },
        {
          kind: "CONSTRAINS_PROPERTIES_ON",
          reversed: false,
          rightEndpoint: {
            baseId:
              "https://hash.ai/@test/types/property-type/notes-and-summary/",
            revisionId: 1,
          },
        },
      ],
    },
    "https://hash.ai/@hash/types/property-type/expired-at/": {
      "1": [
        {
          kind: "CONSTRAINS_VALUES_ON",
          reversed: false,
          rightEndpoint: {
            baseId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/",
            revisionId: 1,
          },
        },
      ],
    },
    "https://hash.ai/@hash/types/property-type/summary/": {
      "1": [
        {
          kind: "CONSTRAINS_VALUES_ON",
          reversed: false,
          rightEndpoint: {
            baseId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/",
            revisionId: 1,
          },
        },
      ],
    },
    "https://hash.ai/@hash/types/property-type/organization-name/": {
      "1": [
        {
          kind: "CONSTRAINS_VALUES_ON",
          reversed: false,
          rightEndpoint: {
            baseId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/",
            revisionId: 1,
          },
        },
      ],
    },
    "https://hash.ai/@hash/types/property-type/archived/": {
      "1": [
        {
          kind: "CONSTRAINS_VALUES_ON",
          reversed: false,
          rightEndpoint: {
            baseId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/",
            revisionId: 1,
          },
        },
      ],
    },
  },
  roots: [
    {
      baseId: "https://hash.ai/@test/types/entity-type/property-values-demo/",
      revisionId: 4,
    },
  ],
  vertices: {
    "https://blockprotocol.org/@blockprotocol/types/data-type/text/": {
      "1": {
        kind: "dataType",
        inner: {
          schema: {
            $schema:
              "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
            kind: "dataType",
            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            title: "Text",
            description: "An ordered sequence of characters",
            type: "string",
          },
          metadata: {
            recordId: {
              baseUrl:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/",
              version: 1,
            },
            provenance: {
              createdById: "8d86c8c3-d66d-43d1-859b-676c3bcaeadc",
            },
            temporalVersioning: {
              transactionTime: {
                start: {
                  kind: "inclusive",
                  limit: "2023-11-11T17:07:53.815929000Z",
                },
                end: {
                  kind: "unbounded",
                },
              },
            },
            fetchedAt: "2023-11-11T17:07:53.812588000Z",
          },
        },
      },
    },
    "https://hash.ai/@test/types/property-type/notes-and-summary/": {
      "1": {
        kind: "propertyType",
        inner: {
          schema: {
            $schema:
              "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
            kind: "propertyType",
            $id: "https://hash.ai/@test/types/property-type/notes-and-summary/v/1",
            title: "Notes And Summary",
            description:
              "A property object which contains an array of notes, and a summary",
            oneOf: [
              {
                type: "object",
                properties: {
                  "https://hash.ai/@d/types/property-type/notes/": {
                    type: "array",
                    items: {
                      $ref: "https://hash.ai/@d/types/property-type/notes/v/1",
                    },
                  },
                  "https://hash.ai/@hash/types/property-type/summary/": {
                    $ref: "https://hash.ai/@hash/types/property-type/summary/v/1",
                  },
                },
              },
            ],
          },
          metadata: {
            recordId: {
              baseUrl:
                "https://hash.ai/@test/types/property-type/notes-and-summary/",
              version: 1,
            },
            provenance: {
              createdById: "a0711135-214a-4a38-9e63-b01a1a14826f",
            },
            temporalVersioning: {
              transactionTime: {
                start: {
                  kind: "inclusive",
                  limit: "2023-11-24T15:10:43.310883000Z",
                },
                end: {
                  kind: "unbounded",
                },
              },
            },
            ownedById: "a0711135-214a-4a38-9e63-b01a1a14826f",
          },
        },
      },
    },
    "https://hash.ai/@test/types/entity-type/property-values-demo/": {
      "4": {
        kind: "entityType",
        inner: {
          schema: {
            $schema:
              "https://blockprotocol.org/types/modules/graph/0.3/schema/entity-type",
            kind: "entityType",
            $id: "https://hash.ai/@test/types/entity-type/property-values-demo/v/4",
            title: "Property Values Demo",
            description:
              "A type with various permutations of expected property value types",
            type: "object",
            properties: {
              "https://hash.ai/@hash/types/property-type/deleted-at/": {
                type: "array",
                items: {
                  $ref: "https://hash.ai/@hash/types/property-type/deleted-at/v/1",
                },
                minItems: 0,
              },
              "https://hash.ai/@test/types/property-type/notes-and-summary/": {
                $ref: "https://hash.ai/@test/types/property-type/notes-and-summary/v/1",
              },
              "https://hash.ai/@hash/types/property-type/archived/": {
                $ref: "https://hash.ai/@hash/types/property-type/archived/v/1",
              },
              "https://hash.ai/@test/types/property-type/mixed-array/": {
                $ref: "https://hash.ai/@test/types/property-type/mixed-array/v/3",
              },
            },
            links: {
              "https://hash.ai/@hash/types/entity-type/has-parent/v/1": {
                type: "array",
                items: {
                  oneOf: [
                    {
                      $ref: "https://hash.ai/@hash/types/entity-type/block-collection/v/1",
                    },
                  ],
                },
                minItems: 0,
                ordered: false,
              },
            },
          },
          metadata: {
            recordId: {
              baseUrl:
                "https://hash.ai/@test/types/entity-type/property-values-demo/",
              version: 4,
            },
            provenance: {
              createdById: "a0711135-214a-4a38-9e63-b01a1a14826f",
            },
            temporalVersioning: {
              transactionTime: {
                start: {
                  kind: "inclusive",
                  limit: "2023-11-24T18:44:26.425746000Z",
                },
                end: {
                  kind: "unbounded",
                },
              },
            },
            ownedById: "a0711135-214a-4a38-9e63-b01a1a14826f",
          },
        },
      },
    },
    "https://blockprotocol.org/@blockprotocol/types/data-type/number/": {
      "1": {
        kind: "dataType",
        inner: {
          schema: {
            $schema:
              "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
            kind: "dataType",
            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
            title: "Number",
            description: "An arithmetical value (in the Real number system)",
            type: "number",
          },
          metadata: {
            recordId: {
              baseUrl:
                "https://blockprotocol.org/@blockprotocol/types/data-type/number/",
              version: 1,
            },
            provenance: {
              createdById: "8d86c8c3-d66d-43d1-859b-676c3bcaeadc",
            },
            temporalVersioning: {
              transactionTime: {
                start: {
                  kind: "inclusive",
                  limit: "2023-11-11T17:07:57.946361000Z",
                },
                end: {
                  kind: "unbounded",
                },
              },
            },
            fetchedAt: "2023-11-11T17:07:57.946363000Z",
          },
        },
      },
    },
    "https://hash.ai/@test/types/property-type/mixed-array/": {
      "3": {
        kind: "propertyType",
        inner: {
          schema: {
            $schema:
              "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
            kind: "propertyType",
            $id: "https://hash.ai/@test/types/property-type/mixed-array/v/3",
            title: "Mixed Array",
            description: "A mixed array type for testing",
            oneOf: [
              {
                type: "array",
                items: {
                  oneOf: [
                    {
                      $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/number/v/1",
                    },
                    {
                      type: "object",
                      properties: {
                        "https://hash.ai/@hash/types/property-type/expired-at/":
                          {
                            type: "array",
                            items: {
                              $ref: "https://hash.ai/@hash/types/property-type/expired-at/v/1",
                            },
                          },
                        "https://hash.ai/@hash/types/property-type/archived/": {
                          $ref: "https://hash.ai/@hash/types/property-type/archived/v/1",
                        },
                      },
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
                      minItems: 0,
                    },
                  ],
                },
                minItems: 0,
              },
              {
                $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
              },
              {
                type: "object",
                properties: {
                  "https://hash.ai/@hash/types/property-type/organization-name/":
                    {
                      type: "array",
                      items: {
                        $ref: "https://hash.ai/@hash/types/property-type/organization-name/v/1",
                      },
                    },
                  "https://hash.ai/@hash/types/property-type/expired-at/": {
                    $ref: "https://hash.ai/@hash/types/property-type/expired-at/v/1",
                  },
                },
              },
            ],
          },
          metadata: {
            recordId: {
              baseUrl: "https://hash.ai/@test/types/property-type/mixed-array/",
              version: 3,
            },
            provenance: {
              createdById: "a0711135-214a-4a38-9e63-b01a1a14826f",
            },
            temporalVersioning: {
              transactionTime: {
                start: {
                  kind: "inclusive",
                  limit: "2023-11-24T15:35:45.866857000Z",
                },
                end: {
                  kind: "unbounded",
                },
              },
            },
            ownedById: "a0711135-214a-4a38-9e63-b01a1a14826f",
          },
        },
      },
    },
    "https://hash.ai/@hash/types/property-type/archived/": {
      "1": {
        kind: "propertyType",
        inner: {
          schema: {
            $schema:
              "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
            kind: "propertyType",
            $id: "https://hash.ai/@hash/types/property-type/archived/v/1",
            title: "Archived",
            description: "Whether or not something has been archived.",
            oneOf: [
              {
                $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
              },
            ],
          },
          metadata: {
            recordId: {
              baseUrl: "https://hash.ai/@hash/types/property-type/archived/",
              version: 1,
            },
            provenance: {
              createdById: "8d86c8c3-d66d-43d1-859b-676c3bcaeadc",
            },
            temporalVersioning: {
              transactionTime: {
                start: {
                  kind: "inclusive",
                  limit: "2023-11-11T17:07:57.272633000Z",
                },
                end: {
                  kind: "unbounded",
                },
              },
            },
            ownedById: "b22dc013-c4a3-4f32-b0bc-dda4d3c00c1e",
          },
        },
      },
    },
    "https://hash.ai/@hash/types/property-type/expired-at/": {
      "1": {
        kind: "propertyType",
        inner: {
          schema: {
            $schema:
              "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
            kind: "propertyType",
            $id: "https://hash.ai/@hash/types/property-type/expired-at/v/1",
            title: "Expired At",
            description: "Stringified timestamp of when something expired.",
            oneOf: [
              {
                $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
              },
            ],
          },
          metadata: {
            recordId: {
              baseUrl: "https://hash.ai/@hash/types/property-type/expired-at/",
              version: 1,
            },
            provenance: {
              createdById: "8d86c8c3-d66d-43d1-859b-676c3bcaeadc",
            },
            temporalVersioning: {
              transactionTime: {
                start: {
                  kind: "inclusive",
                  limit: "2023-11-11T17:07:58.934500000Z",
                },
                end: {
                  kind: "unbounded",
                },
              },
            },
            ownedById: "b22dc013-c4a3-4f32-b0bc-dda4d3c00c1e",
          },
        },
      },
    },
    "https://hash.ai/@hash/types/property-type/summary/": {
      "1": {
        kind: "propertyType",
        inner: {
          schema: {
            $schema:
              "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
            kind: "propertyType",
            $id: "https://hash.ai/@hash/types/property-type/summary/v/1",
            title: "Summary",
            description: "The summary of the something.",
            oneOf: [
              {
                $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
              },
            ],
          },
          metadata: {
            recordId: {
              baseUrl: "https://hash.ai/@hash/types/property-type/summary/",
              version: 1,
            },
            provenance: {
              createdById: "8d86c8c3-d66d-43d1-859b-676c3bcaeadc",
            },
            temporalVersioning: {
              transactionTime: {
                start: {
                  kind: "inclusive",
                  limit: "2023-11-11T17:07:57.151833000Z",
                },
                end: {
                  kind: "unbounded",
                },
              },
            },
            ownedById: "b22dc013-c4a3-4f32-b0bc-dda4d3c00c1e",
          },
        },
      },
    },
    "https://hash.ai/@hash/types/property-type/organization-name/": {
      "1": {
        kind: "propertyType",
        inner: {
          schema: {
            $schema:
              "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
            kind: "propertyType",
            $id: "https://hash.ai/@hash/types/property-type/organization-name/v/1",
            title: "Organization Name",
            description: "The name of an organization.",
            oneOf: [
              {
                $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
              },
            ],
          },
          metadata: {
            recordId: {
              baseUrl:
                "https://hash.ai/@hash/types/property-type/organization-name/",
              version: 1,
            },
            provenance: {
              createdById: "8d86c8c3-d66d-43d1-859b-676c3bcaeadc",
            },
            temporalVersioning: {
              transactionTime: {
                start: {
                  kind: "inclusive",
                  limit: "2023-11-11T17:07:56.848510000Z",
                },
                end: {
                  kind: "unbounded",
                },
              },
            },
            ownedById: "b22dc013-c4a3-4f32-b0bc-dda4d3c00c1e",
          },
        },
      },
    },
    "https://hash.ai/@hash/types/property-type/deleted-at/": {
      "1": {
        kind: "propertyType",
        inner: {
          schema: {
            $schema:
              "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
            kind: "propertyType",
            $id: "https://hash.ai/@hash/types/property-type/deleted-at/v/1",
            title: "Deleted At",
            description: "Stringified timestamp of when something was deleted.",
            oneOf: [
              {
                $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
              },
            ],
          },
          metadata: {
            recordId: {
              baseUrl: "https://hash.ai/@hash/types/property-type/deleted-at/",
              version: 1,
            },
            provenance: {
              createdById: "8d86c8c3-d66d-43d1-859b-676c3bcaeadc",
            },
            temporalVersioning: {
              transactionTime: {
                start: {
                  kind: "inclusive",
                  limit: "2023-11-11T17:07:58.782258000Z",
                },
                end: {
                  kind: "unbounded",
                },
              },
            },
            ownedById: "b22dc013-c4a3-4f32-b0bc-dda4d3c00c1e",
          },
        },
      },
    },
    "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/": {
      "1": {
        kind: "dataType",
        inner: {
          schema: {
            $schema:
              "https://blockprotocol.org/types/modules/graph/0.3/schema/data-type",
            kind: "dataType",
            $id: "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
            title: "Boolean",
            description: "A True or False value",
            type: "boolean",
          },
          metadata: {
            recordId: {
              baseUrl:
                "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/",
              version: 1,
            },
            provenance: {
              createdById: "8d86c8c3-d66d-43d1-859b-676c3bcaeadc",
            },
            temporalVersioning: {
              transactionTime: {
                start: {
                  kind: "inclusive",
                  limit: "2023-11-11T17:07:56.221431000Z",
                },
                end: {
                  kind: "unbounded",
                },
              },
            },
            fetchedAt: "2023-11-11T17:07:56.220506000Z",
          },
        },
      },
    },
    "https://hash.ai/@d/types/property-type/notes/": {
      "1": {
        kind: "propertyType",
        inner: {
          schema: {
            $schema:
              "https://blockprotocol.org/types/modules/graph/0.3/schema/property-type",
            kind: "propertyType",
            $id: "https://hash.ai/@d/types/property-type/notes/v/1",
            title: "Notes",
            description: "Miscellaneous notes about a thing",
            oneOf: [
              {
                $ref: "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
              },
            ],
          },
          metadata: {
            recordId: {
              baseUrl: "https://hash.ai/@d/types/property-type/notes/",
              version: 1,
            },
            provenance: {
              createdById: "3660bed8-caae-4f20-a52c-a7e8ebca8bc4",
            },
            temporalVersioning: {
              transactionTime: {
                start: {
                  kind: "inclusive",
                  limit: "2023-11-22T13:11:10.848780000Z",
                },
                end: {
                  kind: "unbounded",
                },
              },
            },
            ownedById: "3660bed8-caae-4f20-a52c-a7e8ebca8bc4",
          },
        },
      },
    },
  },
};

const expectedResult = {
  isLink: false,
  schema: {
    $id: "https://hash.ai/@test/types/entity-type/property-values-demo/v/4",
    title: "Property Values Demo",
    description:
      "A type with various permutations of expected property value types",
    links: {
      "https://hash.ai/@hash/types/entity-type/has-parent/v/1": {
        type: "array",
        items: {
          oneOf: [
            {
              $ref: "https://hash.ai/@hash/types/entity-type/block-collection/v/1",
            },
          ],
        },
        minItems: 0,
        ordered: false,
      },
    },
    properties: {
      "https://hash.ai/@hash/types/property-type/deleted-at/": {
        type: "array",
        items: {
          $id: "https://hash.ai/@hash/types/property-type/deleted-at/v/1",
          title: "Deleted At",
          description: "Stringified timestamp of when something was deleted.",
          oneOf: [
            {
              type: "string",
            },
          ],
        },
        minItems: 0,
      },
      "https://hash.ai/@test/types/property-type/notes-and-summary/": {
        $id: "https://hash.ai/@test/types/property-type/notes-and-summary/v/1",
        title: "Notes And Summary",
        description:
          "A property object which contains an array of notes, and a summary",
        oneOf: [
          {
            properties: {
              "https://hash.ai/@d/types/property-type/notes/": {
                type: "array",
                items: {
                  $id: "https://hash.ai/@d/types/property-type/notes/v/1",
                  title: "Notes",
                  description: "Miscellaneous notes about a thing",
                  oneOf: [
                    {
                      type: "string",
                    },
                  ],
                },
              },
              "https://hash.ai/@hash/types/property-type/summary/": {
                $id: "https://hash.ai/@hash/types/property-type/summary/v/1",
                title: "Summary",
                description: "The summary of the something.",
                oneOf: [
                  {
                    type: "string",
                  },
                ],
              },
            },
            type: "object",
          },
        ],
      },
      "https://hash.ai/@hash/types/property-type/archived/": {
        $id: "https://hash.ai/@hash/types/property-type/archived/v/1",
        title: "Archived",
        description: "Whether or not something has been archived.",
        oneOf: [
          {
            type: "boolean",
          },
        ],
      },
      "https://hash.ai/@test/types/property-type/mixed-array/": {
        $id: "https://hash.ai/@test/types/property-type/mixed-array/v/3",
        title: "Mixed Array",
        description: "A mixed array type for testing",
        oneOf: [
          {
            items: {
              oneOf: [
                {
                  type: "number",
                },
                {
                  properties: {
                    "https://hash.ai/@hash/types/property-type/expired-at/": {
                      type: "array",
                      items: {
                        $id: "https://hash.ai/@hash/types/property-type/expired-at/v/1",
                        title: "Expired At",
                        description:
                          "Stringified timestamp of when something expired.",
                        oneOf: [
                          {
                            type: "string",
                          },
                        ],
                      },
                    },
                    "https://hash.ai/@hash/types/property-type/archived/": {
                      $id: "https://hash.ai/@hash/types/property-type/archived/v/1",
                      title: "Archived",
                      description:
                        "Whether or not something has been archived.",
                      oneOf: [
                        {
                          type: "boolean",
                        },
                      ],
                    },
                  },
                  type: "object",
                },
                {
                  items: {
                    oneOf: [
                      {
                        type: "number",
                      },
                    ],
                  },
                  minItems: 0,
                  type: "array",
                },
              ],
            },
            minItems: 0,
            type: "array",
          },
          {
            type: "boolean",
          },
          {
            properties: {
              "https://hash.ai/@hash/types/property-type/organization-name/": {
                type: "array",
                items: {
                  $id: "https://hash.ai/@hash/types/property-type/organization-name/v/1",
                  title: "Organization Name",
                  description: "The name of an organization.",
                  oneOf: [
                    {
                      type: "string",
                    },
                  ],
                },
              },
              "https://hash.ai/@hash/types/property-type/expired-at/": {
                $id: "https://hash.ai/@hash/types/property-type/expired-at/v/1",
                title: "Expired At",
                description: "Stringified timestamp of when something expired.",
                oneOf: [
                  {
                    type: "string",
                  },
                ],
              },
            },
            type: "object",
          },
        ],
      },
    },
  },
};

describe("The dereferenceEntityType function", () => {
  it("correctly dereferences an entity type", () => {
    const result = dereferenceEntityType(
      "https://hash.ai/@test/types/entity-type/property-values-demo/v/4",
      testSubgraph as Subgraph,
    );

    expect(result).toEqual(expectedResult);
  });
});
