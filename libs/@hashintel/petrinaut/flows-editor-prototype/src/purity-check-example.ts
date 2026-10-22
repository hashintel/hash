/**
 * The purity check, in plain English first (J4, Figma file 69r6JuKZ2kAr61h7Ci40kh):
 *
 * 1. A flow takes a list of shipments and a purity threshold.
 * 2. It finds the certificates for those shipments.
 * 3. It starts when a shipment changes (threshold 98) and on a schedule, every month.
 */
import {
  addStep,
  emptyDocument,
  type EditorDocument,
  fieldKey,
  START_ID,
} from "./document";
import { mockEntityTypes } from "./mock-graph";

const type = (title: string) =>
  mockEntityTypes.find((candidate) => candidate.title === title)!;

export const purityCheckExample = (): EditorDocument => {
  const { document, stepId } = addStep(
    emptyDocument("Purity check"),
    "queryEntities",
    { after: { stepId: START_ID, port: "next" } },
  );
  const checkedShipment = type("Purity check").properties.find(
    (candidate) => candidate.title === "Shipment",
  )!;
  return {
    ...document,
    startDescription: "Flow inputs",
    inputs: [
      {
        name: "shipments",
        label: "Shipments",
        payloadKind: "EntityId",
        array: true,
        required: true,
      },
      {
        name: "threshold",
        label: "Threshold",
        payloadKind: "Number",
        array: false,
        required: true,
      },
    ],
    inputEntityTypes: { shipments: type("Shipment").baseUrl },
    steps: document.steps.map((step) => ({
      ...step,
      description: "Certificates for these shipments",
    })),
    queries: {
      [fieldKey(stepId, "query")]: {
        entityTypeBaseUrl: type("Purity check").baseUrl,
        conditions: [
          {
            id: 1,
            propertyBaseUrl: checkedShipment.baseUrl,
            operator: "isAnyOf",
            value: null,
            valueSource: { kind: "flow-input", inputName: "shipments" },
          },
        ],
      },
    },
    triggers: [
      {
        id: "shipmentChanges",
        kind: "entityUpdated",
        description: "Shipment changes",
        settings: {
          entityTypeBaseUrl: type("Shipment").baseUrl,
          propertiesToWatch: [],
          inputMap: {
            threshold: { kind: "fixed", value: 98 },
          },
        },
      },
      {
        id: "everyMonth",
        kind: "schedule",
        description: "Every month",
        settings: {
          spec: {
            type: "cron",
            cronExpression: "0 9 1 * *",
            timezone: "Europe/London",
          },
          inputMap: {
            threshold: { kind: "fixed", value: 98 },
          },
        },
      },
    ],
  };
};
