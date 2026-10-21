/**
 * Named starting points, so each screen can be opened on its own (`?state=…`) and laid out side by side on the
 * screens page (ledger, 20 Oct: a clickable prototype alone is not enough). Journey 3 screens carry the Figma frame
 * names (file 69r6JuKZ2kAr61h7Ci40kh, section 422:2613).
 */
import {
  START_ID,
  addStep,
  type ConditionRow,
  emptyDocument,
  type EditorDocument,
  fieldKey,
} from "./document";
import { type EditorUi, initialUi } from "./editor-context";
import { mockEntityTypes } from "./mock-graph";
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

const type = (title: string) =>
  mockEntityTypes.find((candidate) => candidate.title === title)!;
const property = (typeTitle: string, title: string) =>
  type(typeTitle).properties.find((candidate) => candidate.title === title)!
    .baseUrl;

/**
 * Journey 3's flow: a Manual run, "Shipments this month", then "Suppliers of those shipments". `variant` sets the
 * first query's condition value and whether the flow has the Review month input yet.
 */
const journey3 = (
  variant: "typed" | "typing" | "empty" | "flowInput" | "chip",
): EditorDocument => {
  const first = addStep(
    emptyDocument("Monthly supplier review"),
    "queryEntities",
    {
      after: { stepId: START_ID, port: "next" },
    },
  );
  const second = addStep(first.document, "queryEntities", {
    after: { stepId: first.stepId, port: "next" },
  });
  const shipments = first.stepId;
  const suppliers = second.stepId;
  const received: ConditionRow = {
    id: 1,
    propertyBaseUrl: property("Shipment", "Received date"),
    operator: "isIn",
    value:
      variant === "typed"
        ? "October 2026"
        : variant === "typing"
          ? "Octo"
          : null,
    ...(variant === "chip"
      ? {
          valueSource: {
            kind: "flow-input" as const,
            inputName: "reviewMonth",
          },
        }
      : {}),
  };
  const hasInput = variant === "flowInput" || variant === "chip";
  return {
    ...second.document,
    inputs: hasInput
      ? [
          {
            name: "reviewMonth",
            label: "Review month",
            payloadKind: "Date",
            array: false,
            required: true,
          },
        ]
      : [],
    steps: second.document.steps.map((step) => ({
      ...step,
      description:
        step.stepId === shipments
          ? "Shipments this month"
          : "Suppliers of those shipments",
    })),
    queries: {
      [fieldKey(shipments, "query")]: {
        entityTypeBaseUrl: type("Shipment").baseUrl,
        conditions:
          variant === "typed"
            ? [
                received,
                {
                  id: 2,
                  propertyBaseUrl: property("Shipment", "Status"),
                  operator: "equals",
                  value: "Delivered",
                },
              ]
            : [received],
      },
      [fieldKey(suppliers, "query")]: {
        entityTypeBaseUrl: type("Supplier").baseUrl,
        conditions: [
          {
            id: 1,
            propertyBaseUrl: property("Supplier", "Shipments"),
            operator: "isAnyOf",
            value: null,
            valueSource: {
              kind: "step-output",
              stepId: shipments,
              outputName: "entities",
            },
          },
        ],
      },
    },
  };
};

const SHIPMENTS = "findEntities";
const SUPPLIERS = "findEntities2";

const conditionMenu = (stepId: string, mode: "menu" | "mention" = "menu") => ({
  stepId,
  inputName: "query:condition1",
  mode,
});

export const screenStates: ScreenState[] = [
  {
    id: "blank",
    row: "Adding nodes",
    title: "Blank canvas",
    caption:
      "Only Start. The bottom bar: zoom, hand, select, Add node, organize.",
    create: () => ({ document: emptyDocument(), ui: initialUi }),
  },
  {
    id: "picker",
    row: "Adding nodes",
    title: "Add node picker",
    caption:
      "Recommended, recent (once there is history), triggers, browse all.",
    create: () => ({
      document: emptyDocument(),
      ui: { ...initialUi, picker: { anchor: "toolbar" } },
    }),
  },
  {
    id: "j3-a1",
    row: "Journey 3 · Row A · Typed into the step",
    title: "J3 · A1 · Type a fixed value",
    caption: "Received date is in October 2026, and Status is Delivered.",
    create: () => ({
      document: journey3("typed"),
      ui: { ...initialUi, selectedId: SHIPMENTS },
    }),
  },
  {
    id: "j3-b1",
    row: "Journey 3 · Row B · From an earlier step",
    title: "J3 · B1 · Pick an earlier step's output",
    caption: "Shipment is any of the shipments the step before found.",
    create: () => ({
      document: journey3("typed"),
      ui: {
        ...initialUi,
        selectedId: SUPPLIERS,
        openField: conditionMenu(SUPPLIERS),
      },
    }),
  },
  {
    id: "j3-b2",
    row: "Journey 3 · Row B · From an earlier step",
    title: "J3 · B2 · Entity type from an earlier step",
    caption:
      "Entity type takes the same sources: a fixed type, an earlier step, or the graph.",
    create: () => ({
      document: journey3("typed"),
      ui: {
        ...initialUi,
        selectedId: SUPPLIERS,
        openField: { stepId: SUPPLIERS, inputName: "entityType", mode: "menu" },
      },
    }),
  },
  {
    id: "j3-c1",
    row: "Journey 3 · Row C · From the flow's inputs (nothing fits yet)",
    title: "J3 · C1 · Type plain text",
    caption: "The value slot takes typed text.",
    create: () => ({
      document: journey3("typing"),
      ui: { ...initialUi, selectedId: SHIPMENTS },
    }),
  },
  {
    id: "j3-c2",
    row: "Journey 3 · Row C · From the flow's inputs (nothing fits yet)",
    title: "J3 · C2 · Click + · nothing fits yet",
    caption: "Nothing earlier gives a date, so the menu offers Add flow input.",
    create: () => ({
      document: journey3("empty"),
      ui: {
        ...initialUi,
        selectedId: SHIPMENTS,
        openField: conditionMenu(SHIPMENTS),
      },
    }),
  },
  {
    id: "j3-c3",
    row: "Journey 3 · Row C · From the flow's inputs (nothing fits yet)",
    title: "J3 · C3 · Add a flow input on Start",
    caption: "Review month, a date, added to Start's inputs.",
    create: () => ({
      document: journey3("flowInput"),
      ui: { ...initialUi, selectedId: START_ID },
    }),
  },
  {
    id: "j3-c4",
    row: "Journey 3 · Row C · From the flow's inputs (nothing fits yet)",
    title: "J3 · C4 · Back on the step · pick the flow input",
    caption: "Typing @ in the value slot finds Review month.",
    create: () => ({
      document: journey3("flowInput"),
      ui: {
        ...initialUi,
        selectedId: SHIPMENTS,
        openField: conditionMenu(SHIPMENTS, "mention"),
      },
    }),
  },
  {
    id: "j3-c5",
    row: "Journey 3 · Row C · From the flow's inputs (nothing fits yet)",
    title: "J3 · C5 · Chip in at the caret",
    caption: "The value is now Review month.",
    create: () => ({
      document: journey3("chip"),
      ui: { ...initialUi, selectedId: SHIPMENTS },
    }),
  },
  {
    id: "j3-d1",
    row: "Journey 3 · Row D · Change or remove a source",
    title: "J3 · D1 · Hover a chip to remove it",
    caption: "The ⋮ on the condition removes it, or types a value instead.",
    create: () => ({
      document: journey3("chip"),
      ui: { ...initialUi, selectedId: SHIPMENTS },
    }),
  },
  {
    id: "j3-d2",
    row: "Journey 3 · Row D · Change or remove a source",
    title: "J3 · D2 · Click a chip to change its source",
    caption: "Clicking the value reopens the source menu.",
    create: () => ({
      document: journey3("chip"),
      ui: {
        ...initialUi,
        selectedId: SHIPMENTS,
        openField: conditionMenu(SHIPMENTS),
      },
    }),
  },
  {
    id: "start",
    row: "Triggers → Start → steps",
    title: "Start: flow inputs",
    caption: "Start holds the inputs; Run and every trigger fill them.",
    create: () => ({
      document: supplierReviewExample(),
      ui: { ...initialUi, selectedId: START_ID },
    }),
  },
  {
    id: "schedule",
    row: "Triggers → Start → steps",
    title: "Recurring schedule",
    caption: "A trigger left of Start; it maps its data onto Start's inputs.",
    create: () => ({
      document: supplierReviewExample(),
      ui: { ...initialUi, selectedId: "schedule" },
    }),
  },
  {
    id: "for-each",
    row: "For each and running",
    title: "Monthly supplier review",
    caption: "Steps that run per supplier sit inside the group.",
    create: () => ({
      document: supplierReviewExample(),
      ui: { ...initialUi, selectedId: "eachSupplier" },
    }),
  },
  {
    id: "run-form",
    row: "For each and running",
    title: "Manual run form",
    caption: "The Run button's form, built from Start's inputs.",
    create: () => ({
      document: supplierReviewExample(),
      ui: { ...initialUi, runOpen: true },
    }),
  },
];

export const findScreenState = (id: string | null) =>
  screenStates.find((state) => state.id === id);

export { withStepAfterStart };
