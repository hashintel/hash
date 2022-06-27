export const dataTypes = [
  {
    kind: "dataType",
    $id: "https://blockprotocol.org/@blockprotocol/type/data/text",
    name: "Text",
    description: "An ordered sequence of characters",
    type: "string",
  },

  {
    kind: "dataType",
    $id: "https://blockprotocol.org/@blockprotocol/type/data/number",
    name: "Number",
    description: "An arithmetical value (in the Real number system)",
    type: "number",
  },

  {
    kind: "dataType",
    $id: "https://blockprotocol.org/@blockprotocol/type/data/boolean",
    name: "Boolean",
    description: "A True or False value",
    type: "boolean",
  },

  {
    kind: "dataType",
    $id: "https://blockprotocol.org/@blockprotocol/type/data/null",
    name: "Null",
    description: "A placeholder value representing 'nothing'",
    type: "null",
  },

  {
    kind: "dataType",
    $id: "https://blockprotocol.org/@blockprotocol/type/data/object",
    name: "Object",
    description: "A plain JSON object with no pre-defined structure",
    type: "object",
  },

  {
    kind: "dataType",
    $id: "https://blockprotocol.org/@blockprotocol/type/data/empty-list",
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
      $id: "https://blockprotocol.org/@alice/type/property/favorite-quote",
      name: "Favorite Quote",
      oneOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/type/data/text",
        },
      ],
    },
    ["https://blockprotocol.org/@blockprotocol/type/data/text"],
    [],
  ],
  [
    {
      kind: "propertyType",
      $id: "https://blockprotocol.org/@alice/type/property/name",
      name: "Favorite Quote",
      oneOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/type/data/text",
        },
      ],
    },
    ["https://blockprotocol.org/@blockprotocol/type/data/text"],
    [],
  ],
  [
    {
      kind: "propertyType",
      $id: "https://blockprotocol.org/@alice/type/property/published-on",
      name: "Favorite Quote",
      oneOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/type/data/text",
        },
      ],
    },
    ["https://blockprotocol.org/@blockprotocol/type/data/text"],
    [],
  ],
  [
    {
      kind: "propertyType",
      $id: "https://blockprotocol.org/@alice/type/property/blurb",
      name: "Favorite Quote",
      oneOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/type/data/text",
        },
      ],
    },
    ["https://blockprotocol.org/@blockprotocol/type/data/text"],
    [],
  ],
  [
    {
      kind: "propertyType",
      $id: "https://blockprotocol.org/@alice/type/property/tag",
      name: "Favorite Quote",
      oneOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/type/data/text",
        },
      ],
    },
    ["https://blockprotocol.org/@blockprotocol/type/data/text"],
    [],
  ],
  [
    {
      kind: "propertyType",
      $id: "https://blockprotocol.org/@alice/type/property/price",
      name: "Favorite Quote",
      oneOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/type/data/number",
        },
      ],
    },
    ["https://blockprotocol.org/@blockprotocol/type/data/number"],
    [],
  ],
  [
    {
      kind: "propertyType",
      $id: "https://blockprotocol.org/@alice/type/property/popular",
      name: "Favorite Quote",
      oneOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/type/data/boolean",
        },
      ],
    },
    ["https://blockprotocol.org/@blockprotocol/type/data/boolean"],
    [],
  ],
  [
    {
      kind: "propertyType",
      $id: "https://blockprotocol.org/@alice/type/property/text",
      name: "Favorite Quote",
      oneOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/type/data/text",
        },
      ],
    },
    ["https://blockprotocol.org/@blockprotocol/type/data/text"],
    [],
  ],
  [
    {
      kind: "propertyType",
      $id: "https://blockprotocol.org/@alice/type/property/written-by",
      name: "Favorite Quote",
      oneOf: [
        {
          $ref: "https://blockprotocol.org/@blockprotocol/type/data/text",
        },
      ],
    },
    ["https://blockprotocol.org/@blockprotocol/type/data/text"],
    [],
  ],
] as const;

export const entityTypes = [
  [
    {
      kind: "entityType",
      $id: "https://blockprotocol.org/@alice/type/entity/book",
      type: "object",
      name: "Book",
      properties: {
        "https://blockprotocol.org/@alice/type/property/name": {
          $ref: "https://blockprotocol.org/@alice/type/property/name",
        },
        "https://blockprotocol.org/@alice/type/property/published-on": {
          $ref: "https://blockprotocol.org/@alice/type/property/published-on",
        },
        "https://blockprotocol.org/@alice/type/property/blurb": {
          $ref: "https://blockprotocol.org/@alice/type/property/blurb",
        },
        "https://blockprotocol.org/@alice/type/property/written-by": {
          $ref: "https://blockprotocol.org/@alice/type/property/written-by",
        },
      },
      required: ["https://blockprotocol.org/@alice/type/property/name"],
    },
    [
      "https://blockprotocol.org/@alice/type/property/name",
      "https://blockprotocol.org/@alice/type/property/published-on",
      "https://blockprotocol.org/@alice/type/property/blurb",
    ],
  ],
  [
    {
      kind: "entityType",
      $id: "https://blockprotocol.org/@alice/type/entity/product",
      type: "object",
      name: "Product",
      properties: {
        "https://blockprotocol.org/@alice/type/property/name": {
          $ref: "https://blockprotocol.org/@alice/type/property/name",
        },
        "https://blockprotocol.org/@alice/type/property/price": {
          $ref: "https://blockprotocol.org/@alice/type/property/price",
        },

        "https://blockprotocol.org/@alice/type/property/tag": {
          type: "array",
          items: {
            $ref: "https://blockprotocol.org/@alice/type/property/tag",
          },
          minItems: 1,
          maxItems: 5,
        },
      },
      required: ["https://blockprotocol.org/@alice/type/property/tag"],
    },
    [
      "https://blockprotocol.org/@alice/type/property/name",
      "https://blockprotocol.org/@alice/type/property/price",
      {
        dep: "https://blockprotocol.org/@alice/type/property/tag",
        minItems: 1,
        maxItems: 5,
      },
    ],
  ],
  [
    {
      kind: "entityType",
      $id: "https://blockprotocol.org/@alice/type/entity/Song",
      type: "object",
      name: "Song",
      properties: {
        "https://blockprotocol.org/@alice/type/property/name": {
          $ref: "https://blockprotocol.org/@alice/type/property/name",
        },
        "https://blockprotocol.org/@alice/type/property/popular": {
          $ref: "https://blockprotocol.org/@alice/type/property/popular",
        },
      },
    },
    [
      "https://blockprotocol.org/@alice/type/property/name",
      "https://blockprotocol.org/@alice/type/property/popular",
    ],
  ],
  [
    {
      kind: "entityType",
      $id: "https://blockprotocol.org/@alice/type/entity/page",
      type: "object",
      name: "Page",
      properties: {
        "https://blockprotocol.org/@alice/type/property/text": {
          $ref: "https://blockprotocol.org/@alice/type/property/text",
        },
        "https://blockprotocol.org/@alice/type/property/written-by": {
          $ref: "https://blockprotocol.org/@alice/type/property/written-by",
        },
      },
    },
    [
      "https://blockprotocol.org/@alice/type/property/text",
      "https://blockprotocol.org/@alice/type/property/written-by",
    ],
  ],
] as const;
