/**
 * Named starting points, so each screen can be opened on its own (`?state=…`) and laid out side by side on the
 * screens page (ledger, 20 Oct: a clickable prototype alone is not enough).
 */
import {
  START_ID,
  addStep,
  emptyDocument,
  type EditorDocument,
} from "./document";
import { type EditorUi, initialUi } from "./editor-context";
import { supplierReviewExample } from "./supplier-review-example";

export type ScreenState = {
  id: string;
  title: string;
  /** What the screen shows, in one line. */
  caption: string;
  row: string;
  create: () => { document: EditorDocument; ui: EditorUi };
};

const withStepAfterStart = (catalogId: string) => {
  const { document, stepId } = addStep(emptyDocument(), catalogId, {
    after: { stepId: START_ID, port: "next" },
  });
  return { document, stepId };
};

export const screenStates: ScreenState[] = [
  {
    id: "blank",
    row: "Adding nodes",
    title: "Blank canvas",
    caption: "Only Start. One Add node button, and + on Start's port.",
    create: () => ({ document: emptyDocument(), ui: initialUi }),
  },
  {
    id: "picker",
    row: "Adding nodes",
    title: "Add node picker",
    caption: "Recommended, recent (once there is history), browse all.",
    create: () => ({
      document: emptyDocument(),
      ui: { ...initialUi, picker: { anchor: "toolbar" } },
    }),
  },
  {
    id: "first-step",
    row: "Wiring inputs",
    title: "Find entities: the query",
    caption: "Properties table (D27 A). The query copies the DS filter chips.",
    create: () => {
      const { document, stepId } = withStepAfterStart("queryEntities");
      return {
        document: {
          ...document,
          queries: {
            [`${stepId}.query`]: {
              entityTypeBaseUrl:
                "https://hash.ai/@acme-quality/types/entity-type/supplier/",
              conditions: [
                {
                  id: 1,
                  propertyBaseUrl:
                    "https://hash.ai/@acme-quality/types/property-type/status/",
                  operator: "equals",
                  value: "Active",
                },
              ],
            },
          },
        },
        ui: { ...initialUi, selectedId: stepId },
      };
    },
  },
  {
    id: "empty-state",
    row: "Wiring inputs",
    title: "Nothing earlier fits",
    caption: "The source menu leads to adding a flow input on Start.",
    create: () => {
      const { document, stepId } = withStepAfterStart("sendEmail");
      return {
        document,
        ui: {
          ...initialUi,
          selectedId: stepId,
          openField: { stepId, inputName: "to", mode: "menu" },
        },
      };
    },
  },
  {
    id: "source-menu",
    row: "Wiring inputs",
    title: "Source menu",
    caption: "Only values that fit, checked by the engine's canConnect.",
    create: () => ({
      document: supplierReviewExample(),
      ui: {
        ...initialUi,
        selectedId: "fetchCertificate",
        openField: {
          stepId: "fetchCertificate",
          inputName: "url",
          mode: "menu",
        },
      },
    }),
  },
  {
    id: "mention",
    row: "Wiring inputs",
    title: "Free text: @ chips",
    caption: "Typing @ searches values; the pick becomes an inline chip.",
    create: () => ({
      document: supplierReviewExample(),
      ui: {
        ...initialUi,
        selectedId: "draftReviewEmail",
        openField: {
          stepId: "draftReviewEmail",
          inputName: "instructions",
          mode: "mention",
        },
      },
    }),
  },
  {
    id: "for-each",
    row: "For each",
    title: "Monthly supplier review",
    caption: "Steps that run per supplier sit inside the group.",
    create: () => ({
      document: supplierReviewExample(),
      ui: { ...initialUi, selectedId: "eachSupplier" },
    }),
  },
  {
    id: "start",
    row: "For each",
    title: "Start: flow inputs",
    caption: "Each input lists the steps that use it.",
    create: () => ({
      document: supplierReviewExample(),
      ui: { ...initialUi, selectedId: START_ID },
    }),
  },
  {
    id: "run-form",
    row: "How runs start",
    title: "Manual run form",
    caption: "Generated from the Start inputs, as the legacy run modal is.",
    create: () => ({
      document: supplierReviewExample(),
      ui: { ...initialUi, runOpen: true },
    }),
  },
  {
    id: "triggers",
    row: "How runs start",
    title: "Triggers (proposal)",
    caption: "Manual, schedule (real ScheduleSpec), entity change (mock).",
    create: () => ({
      document: supplierReviewExample(),
      ui: { ...initialUi, triggersOpen: true },
    }),
  },
];

export const findScreenState = (id: string | null) =>
  screenStates.find((state) => state.id === id);
