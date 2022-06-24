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
] as const;
