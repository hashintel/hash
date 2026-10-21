/**
 * The monthly supplier review, in plain English first (ledger, 15 Oct: every example starts from a story):
 *
 * 1. On the 1st of every month, the quality team's review starts.
 * 2. It finds the active suppliers.
 * 3. For each supplier, it reads their name, contact email and certificate link, and fetches the certificate.
 * 4. AI drafts a short review email, which is sent to the supplier.
 * 5. The supplier is marked as reviewed for that month.
 */
import { emptyDocument, type EditorDocument, fieldKey } from "./document";
import { mockEntityTypes } from "./mock-graph";

const [supplier] = mockEntityTypes;
const property = (title: string) =>
  supplier.properties.find((candidate) => candidate.title === title)!;

const readProperty = (title: string) => ({
  kind: "constant" as const,
  payload: {
    // MOCK kind from #10051.
    kind: "EntityProperty" as never,
    value: {
      kind: "entityProperty",
      propertyTypeBaseUrl: property(title).baseUrl,
      payloadKind: property(title).payloadKind,
    },
  },
});

const item = { kind: "item" as const };

export const supplierReviewExample = (): EditorDocument => {
  const base = emptyDocument("Monthly supplier review");
  return {
    ...base,
    inputs: [
      {
        name: "reviewMonth",
        label: "Review month",
        payloadKind: "Date",
        array: false,
        required: true,
      },
    ],
    steps: [
      {
        kind: "action",
        stepId: "findSuppliers",
        actionDefinitionId: "queryEntities",
        description: "Find active suppliers",
        inputs: {},
      },
      {
        kind: "for-each",
        stepId: "eachSupplier",
        description: "For each supplier",
        over: {
          kind: "step-output",
          stepId: "findSuppliers",
          outputName: "entities",
        },
        collect: {
          stepId: "markReviewed",
          outputName: "entityId",
          as: "reviewedSuppliers",
        },
        steps: [
          {
            kind: "action",
            stepId: "readName",
            actionDefinitionId: "readEntity",
            description: "Read supplier name",
            inputs: { entityId: item, property: readProperty("Name") },
          },
          {
            kind: "action",
            stepId: "readEmail",
            actionDefinitionId: "readEntity",
            description: "Read contact email",
            inputs: { entityId: item, property: readProperty("Contact email") },
          },
          {
            kind: "action",
            stepId: "readCertificateLink",
            actionDefinitionId: "readEntity",
            description: "Read certificate link",
            inputs: {
              entityId: item,
              property: readProperty("Certificate link"),
            },
          },
          {
            kind: "action",
            stepId: "fetchCertificate",
            actionDefinitionId: "getFileFromUrl",
            description: "Fetch certificate",
            inputs: {
              url: {
                kind: "step-output",
                stepId: "readCertificateLink",
                outputName: "value",
                whenMissing: "skip",
              },
            },
          },
          {
            kind: "action",
            stepId: "draftReviewEmail",
            actionDefinitionId: "draftMessage",
            description: "Draft review email",
            inputs: {},
          },
          {
            kind: "action",
            stepId: "sendReviewEmail",
            actionDefinitionId: "sendEmail",
            description: "Send review email",
            inputs: {
              senderAddress: {
                kind: "constant",
                payload: { kind: "Text", value: "quality@acme.example" },
              },
            },
          },
          {
            kind: "action",
            stepId: "markReviewed",
            actionDefinitionId: "updateEntity",
            description: "Mark supplier reviewed",
            inputs: { entityId: item },
          },
        ],
      },
    ],
    positions: {
      start: { x: 40, y: 300 },
      schedule: { x: -280, y: 300 },
      findSuppliers: { x: 340, y: 300 },
      eachSupplier: { x: 660, y: 140 },
      readName: { x: 32, y: 72 },
      readEmail: { x: 32, y: 192 },
      readCertificateLink: { x: 32, y: 312 },
      fetchCertificate: { x: 340, y: 312 },
      draftReviewEmail: { x: 648, y: 132 },
      sendReviewEmail: { x: 956, y: 192 },
      markReviewed: { x: 1264, y: 192 },
    },
    wires: [
      {
        id: "w1",
        source: "start",
        sourcePort: "next",
        target: "findSuppliers",
      },
      {
        id: "w1b",
        source: "schedule",
        sourcePort: "next",
        target: "start",
      },
      {
        id: "w2",
        source: "findSuppliers",
        sourcePort: "next",
        target: "eachSupplier",
      },
      {
        id: "w3",
        source: "readName",
        sourcePort: "next",
        target: "draftReviewEmail",
      },
      {
        id: "w4",
        source: "readCertificateLink",
        sourcePort: "next",
        target: "fetchCertificate",
      },
      {
        id: "w5",
        source: "fetchCertificate",
        sourcePort: "next",
        target: "draftReviewEmail",
      },
      {
        id: "w6",
        source: "draftReviewEmail",
        sourcePort: "next",
        target: "sendReviewEmail",
      },
      {
        id: "w7",
        source: "readEmail",
        sourcePort: "next",
        target: "sendReviewEmail",
      },
      {
        id: "w8",
        source: "sendReviewEmail",
        sourcePort: "next",
        target: "markReviewed",
      },
    ],
    queries: {
      [fieldKey("findSuppliers", "query")]: {
        entityTypeBaseUrl: supplier.baseUrl,
        conditions: [
          {
            id: 1,
            propertyBaseUrl: property("Status").baseUrl,
            operator: "equals",
            value: "Active",
          },
        ],
      },
    },
    templates: {
      [fieldKey("draftReviewEmail", "instructions")]: [
        {
          kind: "text",
          text: "Write a short, friendly monthly quality review for ",
        },
        {
          kind: "ref",
          source: {
            kind: "step-output",
            stepId: "readName",
            outputName: "value",
            whenMissing: "skip",
          },
        },
        {
          kind: "text",
          text: ". Say their certificate is on file and ask them to reply with any questions.",
        },
      ],
      [fieldKey("sendReviewEmail", "subject")]: [
        {
          kind: "ref",
          source: {
            kind: "step-output",
            stepId: "draftReviewEmail",
            outputName: "subject",
          },
        },
      ],
      [fieldKey("sendReviewEmail", "body")]: [
        {
          kind: "ref",
          source: {
            kind: "step-output",
            stepId: "draftReviewEmail",
            outputName: "body",
          },
        },
      ],
    },
    lists: {
      [fieldKey("draftReviewEmail", "entities")]: [{ kind: "item" }],
      [fieldKey("sendReviewEmail", "to")]: [
        {
          kind: "step-output",
          stepId: "readEmail",
          outputName: "value",
          whenMissing: "skip",
        },
      ],
    },
    patches: {
      markReviewed: [
        {
          id: 1,
          propertyBaseUrl: property("Last reviewed").baseUrl,
          source: { kind: "flow-input", inputName: "reviewMonth" },
        },
      ],
    },
    triggers: [
      {
        id: "schedule",
        kind: "schedule",
        description: "",
        settings: {
          spec: {
            type: "cron",
            cronExpression: "0 9 1 * *",
            timezone: "Europe/London",
          },
          inputMap: { reviewMonth: { kind: "fixed", value: "2026-10-01" } },
        },
      },
    ],
  };
};
