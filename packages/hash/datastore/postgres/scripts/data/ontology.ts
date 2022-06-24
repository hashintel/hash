export const dataTypes = [
  {
    kind: "dataType",
    $id: "https://blockprotocol.org/types/@blockprotocol/data-type/text",
    name: "Text",
    description: "An ordered sequence of characters",
    type: "string",
  },

  {
    kind: "dataType",
    $id: "https://blockprotocol.org/types/@blockprotocol/data-type/number",
    name: "Number",
    description: "An arithmetical value (in the Real number system)",
    type: "number",
  },

  {
    kind: "dataType",
    $id: "https://blockprotocol.org/types/@blockprotocol/data-type/boolean",
    name: "Boolean",
    description: "A True or False value",
    type: "boolean",
  },

  {
    kind: "dataType",
    $id: "https://blockprotocol.org/types/@blockprotocol/data-type/null",
    name: "Null",
    description: "A placeholder value representing 'nothing'",
    type: "null",
  },

  {
    kind: "dataType",
    $id: "https://blockprotocol.org/types/@blockprotocol/data-type/object",
    name: "Object",
    description: "A plain JSON object with no pre-defined structure",
    type: "object",
  },

  {
    kind: "dataType",
    $id: "https://blockprotocol.org/types/@blockprotocol/data-type/empty-list",
    name: "Empty List",
    description: "An Empty List",
    type: "array",
    maxItems: 0,
  },
] as const;

export const propertyTypes = [
  [
    {
      kind: "propertyType",
      $id: "https://blockprotocol.org/types/@alice/property-type/favorite-quote",
      name: "Favorite Quote",
      oneOf: [
        {
          $ref: "https://blockprotocol.org/types/@blockprotocol/data-type/text",
        },
      ],
    },
    ["https://blockprotocol.org/types/@blockprotocol/data-type/text"],
    [],
  ],
  [
    {
      kind: "propertyType",
      $id: "https://blockprotocol.org/types/@alice/property-type/name",
      name: "Favorite Quote",
      oneOf: [
        {
          $ref: "https://blockprotocol.org/types/@blockprotocol/data-type/text",
        },
      ],
    },
    ["https://blockprotocol.org/types/@blockprotocol/data-type/text"],
    [],
  ],
  [
    {
      kind: "propertyType",
      $id: "https://blockprotocol.org/types/@alice/property-type/published-on",
      name: "Favorite Quote",
      oneOf: [
        {
          $ref: "https://blockprotocol.org/types/@blockprotocol/data-type/text",
        },
      ],
    },
    ["https://blockprotocol.org/types/@blockprotocol/data-type/text"],
    [],
  ],
  [
    {
      kind: "propertyType",
      $id: "https://blockprotocol.org/types/@alice/property-type/blurb",
      name: "Favorite Quote",
      oneOf: [
        {
          $ref: "https://blockprotocol.org/types/@blockprotocol/data-type/text",
        },
      ],
    },
    ["https://blockprotocol.org/types/@blockprotocol/data-type/text"],
    [],
  ],
  [
    {
      kind: "propertyType",
      $id: "https://blockprotocol.org/types/@alice/property-type/tag",
      name: "Favorite Quote",
      oneOf: [
        {
          $ref: "https://blockprotocol.org/types/@blockprotocol/data-type/text",
        },
      ],
    },
    ["https://blockprotocol.org/types/@blockprotocol/data-type/text"],
    [],
  ],
  [
    {
      kind: "propertyType",
      $id: "https://blockprotocol.org/types/@alice/property-type/price",
      name: "Favorite Quote",
      oneOf: [
        {
          $ref: "https://blockprotocol.org/types/@blockprotocol/data-type/number",
        },
      ],
    },
    ["https://blockprotocol.org/types/@blockprotocol/data-type/number"],
    [],
  ],
  [
    {
      kind: "propertyType",
      $id: "https://blockprotocol.org/types/@alice/property-type/popular",
      name: "Favorite Quote",
      oneOf: [
        {
          $ref: "https://blockprotocol.org/types/@blockprotocol/data-type/boolean",
        },
      ],
    },
    ["https://blockprotocol.org/types/@blockprotocol/data-type/boolean"],
    [],
  ],
  [
    {
      kind: "propertyType",
      $id: "https://blockprotocol.org/types/@alice/property-type/text",
      name: "Favorite Quote",
      oneOf: [
        {
          $ref: "https://blockprotocol.org/types/@blockprotocol/data-type/text",
        },
      ],
    },
    ["https://blockprotocol.org/types/@blockprotocol/data-type/text"],
    [],
  ],
  [
    {
      kind: "propertyType",
      $id: "https://blockprotocol.org/types/@alice/property-type/written-by",
      name: "Favorite Quote",
      oneOf: [
        {
          $ref: "https://blockprotocol.org/types/@blockprotocol/data-type/text",
        },
      ],
    },
    ["https://blockprotocol.org/types/@blockprotocol/data-type/text"],
    [],
  ],
] as const;

export const entityTypes = [
  [
    {
      kind: "entityType",
      $id: "https://blockprotocol.org/types/@alice/entity-type/book",
      type: "object",
      name: "Book",
      properties: {
        "https://blockprotocol.org/types/@alice/property-type/name": {
          $ref: "https://blockprotocol.org/types/@alice/property-type/name",
        },
        "https://blockprotocol.org/types/@alice/property-type/published-on": {
          $ref: "https://blockprotocol.org/types/@alice/property-type/published-on",
        },
        "https://blockprotocol.org/types/@alice/property-type/blurb": {
          $ref: "https://blockprotocol.org/types/@alice/property-type/blurb",
        },
        "https://blockprotocol.org/types/@alice/property-type/written-by": {
          $ref: "https://blockprotocol.org/types/@alice/property-type/written-by",
        },
      },
      required: ["https://blockprotocol.org/types/@alice/property-type/name"],
    },
    [
      "https://blockprotocol.org/types/@alice/property-type/name",
      "https://blockprotocol.org/types/@alice/property-type/published-on",
      "https://blockprotocol.org/types/@alice/property-type/blurb",
    ],
  ],
  [
    {
      kind: "entityType",
      $id: "https://blockprotocol.org/types/@alice/entity-type/product",
      type: "object",
      name: "Product",
      properties: {
        "https://blockprotocol.org/types/@alice/property-type/name": {
          $ref: "https://blockprotocol.org/types/@alice/property-type/name",
        },
        "https://blockprotocol.org/types/@alice/property-type/price": {
          $ref: "https://blockprotocol.org/types/@alice/property-type/price",
        },

        "https://blockprotocol.org/types/@alice/property-type/tag": {
          type: "array",
          items: {
            $ref: "https://blockprotocol.org/types/@alice/property-type/tag",
          },
          minItems: 1,
          maxItems: 5,
        },
      },
      required: ["https://blockprotocol.org/types/@alice/property-type/tag"],
    },
    [
      "https://blockprotocol.org/types/@alice/property-type/name",
      "https://blockprotocol.org/types/@alice/property-type/price",

      {
        dep: "https://blockprotocol.org/types/@alice/property-type/tag",
        minItems: 1,
        maxItems: 5,
      },
    ],
  ],
  [
    {
      kind: "entityType",
      $id: "https://blockprotocol.org/types/@alice/entity-type/Song",
      type: "object",
      name: "Song",
      properties: {
        "https://blockprotocol.org/types/@alice/property-type/name": {
          $ref: "https://blockprotocol.org/types/@alice/property-type/name",
        },
        "https://blockprotocol.org/types/@alice/property-type/popular": {
          $ref: "https://blockprotocol.org/types/@alice/property-type/popular",
        },
      },
    },
    [
      "https://blockprotocol.org/types/@alice/property-type/name",
      "https://blockprotocol.org/types/@alice/property-type/popular",
    ],
  ],
  [
    {
      kind: "entityType",
      $id: "https://blockprotocol.org/types/@alice/entity-type/page",
      type: "object",
      name: "Page",
      properties: {
        "https://blockprotocol.org/types/@alice/property-type/text": {
          $ref: "https://blockprotocol.org/types/@alice/property-type/text",
        },
        "https://blockprotocol.org/types/@alice/property-type/written-by": {
          $ref: "https://blockprotocol.org/types/@alice/property-type/written-by",
        },
      },
    },
    [
      "https://blockprotocol.org/types/@alice/property-type/text",
      "https://blockprotocol.org/types/@alice/property-type/written-by",
    ],
  ],
] as const;
