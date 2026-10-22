/**
 * The supplier certificates flow, in plain English first (J2, Figma file 69r6JuKZ2kAr61h7Ci40kh):
 *
 * 1. Find this month's shipments.
 * 2. Find the suppliers of those shipments.
 * 3. For each supplier, fetch their certificates of analysis.
 *
 * `stage` is how far along the person is: the screens of Journey 2 each show one stage.
 */
import {
  addStep,
  emptyDocument,
  type EditorDocument,
  fieldKey,
  itemPropertySource,
  START_ID,
} from "./document";
import { mockEntityTypes } from "./mock-graph";

const type = (title: string) =>
  mockEntityTypes.find((candidate) => candidate.title === title)!;
const property = (typeTitle: string, title: string) =>
  type(typeTitle).properties.find((candidate) => candidate.title === title)!
    .baseUrl;

export const SHIPMENTS = "findEntities";
export const SUPPLIERS = "findEntities2";
export const EACH_SUPPLIER = "forEach";
export const CERTIFICATES = "fetchFile";

export type CertificatesStage =
  | "shipments"
  | "suppliers"
  | "empty-for-each"
  | "for-each-list"
  | "fetch-file";

const stages: CertificatesStage[] = [
  "shipments",
  "suppliers",
  "empty-for-each",
  "for-each-list",
  "fetch-file",
];

export const supplierCertificatesExample = (
  stage: CertificatesStage,
): EditorDocument => {
  const reached = (candidate: CertificatesStage) =>
    stages.indexOf(stage) >= stages.indexOf(candidate);
  const describe = (
    document: EditorDocument,
    descriptions: Record<string, string>,
  ): EditorDocument => ({
    ...document,
    steps: document.steps.map((step) => ({
      ...step,
      description: descriptions[step.stepId] ?? step.description,
    })),
  });

  const shipments = addStep(emptyDocument(), "queryEntities", {
    after: { stepId: START_ID, port: "next" },
  });
  let document: EditorDocument = {
    ...shipments.document,
    startDescription: "Flow inputs",
    queries: {
      [fieldKey(SHIPMENTS, "query")]: {
        entityTypeBaseUrl: type("Shipment").baseUrl,
        conditions: [
          {
            id: 1,
            propertyBaseUrl: property("Shipment", "Received date"),
            operator: "greaterThan",
            value: "2026-09-30",
          },
        ],
      },
    },
  };
  document = describe(document, { [SHIPMENTS]: "Shipments this month" });

  if (reached("suppliers")) {
    const suppliers = addStep(document, "queryEntities", {
      after: { stepId: SHIPMENTS, port: "next" },
    });
    document = describe(suppliers.document, {
      [SUPPLIERS]: "Suppliers of those shipments",
    });
    document = {
      ...document,
      queries: {
        ...document.queries,
        [fieldKey(SUPPLIERS, "query")]: {
          entityTypeBaseUrl: type("Supplier").baseUrl,
          conditions: [
            {
              id: 1,
              propertyBaseUrl: property("Supplier", "Shipment"),
              operator: "isAnyOf",
              value: null,
              valueSource: {
                kind: "step-output",
                stepId: SHIPMENTS,
                outputName: "entities",
              },
            },
          ],
        },
      },
    };
  }

  if (reached("empty-for-each")) {
    document = addStep(document, "forEach", {
      after: { stepId: SUPPLIERS, port: "next" },
    }).document;
  }

  if (reached("for-each-list")) {
    document = {
      ...document,
      steps: document.steps.map((step) =>
        step.stepId === EACH_SUPPLIER && step.kind === "for-each"
          ? {
              ...step,
              description: "For each supplier",
              over: {
                kind: "step-output",
                stepId: SUPPLIERS,
                outputName: "entities",
              },
            }
          : step,
      ),
    };
  }

  if (reached("fetch-file")) {
    const fetched = addStep(document, "getFileFromUrl", {
      parentId: EACH_SUPPLIER,
    });
    document = describe(fetched.document, {
      [CERTIFICATES]: "Certificates of analysis",
    });
    document = {
      ...document,
      steps: document.steps.map((step) =>
        step.kind === "for-each"
          ? {
              ...step,
              steps: step.steps.map((inner) =>
                inner.kind === "action" && inner.stepId === CERTIFICATES
                  ? { ...inner, inputs: {
                      url: itemPropertySource(
                        property("Supplier", "Certificate link"),
                      ),
                    } }
                  : inner,
              ),
            }
          : step,
      ),
    };
  }
  return document;
};
