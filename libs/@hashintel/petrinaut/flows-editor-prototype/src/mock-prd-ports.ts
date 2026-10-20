/**
 * MOCK: the user-facing layer from the draft PRD database "Flows action inputs and outputs" (Notion, under "PRD: New
 * Flows MVP", read 2026-10-21). It is a draft, not a decision: where it conflicts with the decisions ledger or the
 * engine, the editor follows those and the holes log says so.
 *
 * Each entry maps an engine input or output name to the PRD port: its label, description, the sources the picker
 * offers, and any requirement rule. Ports the engine has no input for are listed under `missing`.
 */
export type PrdSource =
  | "Manual input"
  | "HASH graph @lookup"
  | "AI prompt"
  | "Previous step"
  | "File upload";

export type PrdPort = {
  label: string;
  description: string;
  sources?: PrdSource[];
  rule?: string;
};

export type PrdBlock = {
  block: string;
  inputs: Record<string, PrdPort>;
  outputs: Record<string, PrdPort>;
  /** PRD ports with no engine input or output yet. */
  missing: string[];
};

export const prdBlocks: Record<string, PrdBlock> = {
  queryEntities: {
    block: "Find entities",
    inputs: {
      query: {
        label: "Filter",
        description:
          "Filter on properties and links. The PRD has it as long text that an AI prompt could write; the editor uses the condition builder.",
        sources: ["Manual input", "Previous step"],
        rule: "At least 1 of Webs, Entity type, Filter.",
      },
    },
    outputs: {
      entities: { label: "Entities", description: "Matched list of entities" },
    },
    missing: [
      "Webs",
      "Sort by",
      "Sort direction",
      "Limit (as its own port)",
      "Count (output)",
    ],
  },
  readEntity: {
    block: "Read entity",
    inputs: {
      entityId: {
        label: "Entity",
        description: "The entity to load.",
        sources: ["Manual input", "HASH graph @lookup", "Previous step"],
      },
      property: {
        label: "Property to read",
        description:
          "The PRD reads several properties, each its own output. The engine (#10051) reads one per step.",
        sources: ["Manual input"],
      },
    },
    outputs: {
      value: {
        label: "Property value",
        description: "Typed by the property's data type.",
      },
    },
    missing: [
      "Links to follow",
      "Entity type (output)",
      "Linked entity IDs (output)",
      "Web (output)",
    ],
  },
  createEntity: {
    block: "Create entity",
    inputs: {
      entityTypeId: {
        label: "Entity type",
        description: "The type of entity to create.",
        sources: ["HASH graph @lookup"],
      },
      properties: {
        label: "Property values",
        description:
          "One input per property of the chosen type. The type's required properties are required inputs.",
        sources: [
          "Manual input",
          "HASH graph @lookup",
          "AI prompt",
          "Previous step",
        ],
      },
      draft: {
        label: "Draft",
        description:
          "Create the entity as a draft for someone to review before it goes live. False by default.",
        sources: ["Manual input"],
      },
    },
    outputs: {
      entityId: {
        label: "Entity",
        description:
          "The new entity, so later steps can read, update or link to it.",
      },
    },
    missing: ["Web", "Link type", "Linked entity", "Link properties"],
  },
  updateEntity: {
    block: "Update entity",
    inputs: {
      entityId: {
        label: "Entity",
        description: "The entity to change.",
        sources: ["HASH graph @lookup", "Previous step"],
      },
      propertyPatches: {
        label: "Property values",
        description: "One input per property to change.",
        sources: [
          "Manual input",
          "HASH graph @lookup",
          "AI prompt",
          "Previous step",
        ],
        rule: "At least 1 of Property values, Add link, Remove link.",
      },
    },
    outputs: {
      entityId: {
        label: "Entity",
        description:
          "The updated entity, passed on so later steps can chain from it.",
      },
    },
    missing: [
      "Add link (type)",
      "Add linked entity",
      "Add link properties",
      "Remove link (type)",
      "Remove linked entity",
    ],
  },
  draftMessage: {
    block: "Generate text with AI",
    inputs: {
      instructions: {
        label: "Prompt",
        description:
          "What the AI should write. Can include placeholders filled from earlier steps.",
        sources: ["Manual input", "Previous step"],
      },
      context: {
        label: "Context",
        description: "Text the AI reads before writing.",
        sources: ["Previous step"],
      },
      entities: {
        label: "Context entities",
        description: "Entities or files the AI reads before writing.",
        sources: ["HASH graph @lookup", "Previous step", "File upload"],
      },
    },
    outputs: {
      subject: {
        label: "Subject",
        description:
          "The PRD's block has one Text output; the engine's Draft message (#10099) gives a subject and a body.",
      },
      body: { label: "Text", description: "The text the AI wrote." },
    },
    missing: ["Model", "AI account"],
  },
  sendEmail: {
    block: "Send email",
    inputs: {
      to: {
        label: "Recipient address",
        description:
          "Who receives the email: one or a list of addresses. Under a For each, use the item.",
        sources: ["Manual input", "HASH graph @lookup", "Previous step"],
      },
      cc: {
        label: "CC addresses",
        description: "Extra addresses copied on the email.",
        sources: ["Manual input", "HASH graph @lookup", "Previous step"],
      },
      subject: {
        label: "Subject",
        description: "The email's title line.",
        sources: ["Manual input", "AI prompt", "Previous step"],
      },
      body: {
        label: "Body",
        description:
          "The email text. Manual text can include placeholders filled from earlier steps.",
        sources: ["Manual input", "AI prompt", "Previous step"],
      },
      senderAddress: {
        label: "Sender address",
        description: "The address the email is sent from.",
        sources: ["Manual input", "HASH graph @lookup", "Previous step"],
      },
      attachments: {
        label: "Attachments",
        description: "Files attached to the email.",
        sources: ["File upload", "HASH graph @lookup", "Previous step"],
      },
    },
    outputs: {
      messageId: {
        label: "Message ID",
        description:
          "The email's Message-ID header, to find replies or reply in the thread.",
      },
      sentAt: { label: "Sent at", description: "When the email was sent." },
    },
    missing: [],
  },
  forEach: {
    block: "For each",
    inputs: {
      over: {
        label: "List",
        description: "The list to loop over.",
        sources: ["HASH graph @lookup", "Previous step"],
      },
    },
    outputs: {},
    missing: [
      "Max items in parallel",
      "On item failure",
      "Item index (output)",
      "Item count (output)",
      "Failed items per step (output)",
      "Collected lists per step output (the engine collects one)",
    ],
  },
};

/** The PRD port for an engine input, if the draft lists one. */
export const prdInput = (catalogId: string, inputName: string) =>
  prdBlocks[catalogId]?.inputs[inputName];

export const prdOutput = (catalogId: string, outputName: string) =>
  prdBlocks[catalogId]?.outputs[outputName];

/** Whether the draft lets a port take a source. Ports the draft doesn't list allow every source. */
export const prdAllows = (port: PrdPort | undefined, source: PrdSource) =>
  !port?.sources || port.sources.includes(source);
