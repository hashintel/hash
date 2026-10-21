/**
 * Named starting points, so each screen can be opened on its own (`?state=…`) and laid out side by side on the
 * screens page (ledger, 20 Oct: a clickable prototype alone is not enough). Journey 3 screens carry the Figma frame
 * names (file 69r6JuKZ2kAr61h7Ci40kh, section 422:2613).
 */
import {
  START_ID,
  addStep,
  type ConditionRow,
  type QueryDraft,
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
  /** The Figma journey on ↳ Current this screen belongs to (1–4). */
  journey: 1 | 2 | 3 | 4;
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
 * Journey 3's flow (Figma J3, section 470:3681): a Manual run, "Shipments this month", then "Suppliers of those
 * shipments". `shipments` is the first step's query; `withInput` adds Start's Review month input.
 */
const journey3 = (
  shipments: Omit<QueryDraft, "entityTypeBaseUrl">,
  withInput = false,
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
  const shipmentsId = first.stepId;
  const suppliers = second.stepId;
  return {
    ...second.document,
    startDescription: "Flow inputs",
    inputs: withInput
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
        step.stepId === shipmentsId
          ? "Shipments this month"
          : "Suppliers of those shipments",
    })),
    queries: {
      [fieldKey(shipmentsId, "query")]: {
        entityTypeBaseUrl: type("Shipment").baseUrl,
        ...shipments,
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
              stepId: shipmentsId,
              outputName: "entities",
            },
          },
        ],
      },
    },
  };
};

const received = (change: Partial<ConditionRow> = {}): ConditionRow => ({
  id: 1,
  propertyBaseUrl: property("Shipment", "Received date"),
  operator: "greaterThan",
  value: "2026-09-30",
  ...change,
});

/** J3 A1's query: a date, a number, and a grey group of two suppliers joined by "Or". */
const fullQuery: Omit<QueryDraft, "entityTypeBaseUrl"> = {
  conditions: [
    received(),
    {
      id: 2,
      propertyBaseUrl: property("Shipment", "Purity"),
      operator: "lessThan",
      value: 90,
    },
  ],
  groups: [
    {
      id: 3,
      conjunction: "or",
      conditions: [
        {
          id: 4,
          propertyBaseUrl: property("Shipment", "Supplier"),
          operator: "equals",
          value: null,
          values: ["Acme Metals"],
        },
        {
          id: 5,
          propertyBaseUrl: property("Shipment", "Supplier"),
          operator: "equals",
          value: null,
          values: ["Borealis Chem"],
        },
      ],
    },
  ],
};

const SHIPMENTS = "findEntities";
const SUPPLIERS = "findEntities2";

/** Opens a part of a condition row in a screen state: its variable picker, operator menu or value editor. */
const conditionMenu = (
  stepId: string,
  mode: "menu" | "mention" = "menu",
  part?: "operator" | "value" | "footer",
  row = 1,
) => ({
  stepId,
  inputName: `query:condition${row}${part ? `:${part}` : ""}`,
  mode,
});

export const screenStates: ScreenState[] = [
  {
    id: "blank",
    journey: 1,
    row: "Adding nodes",
    title: "Blank canvas",
    caption:
      "Only Start. The bottom bar: zoom, hand, select, Add node, organize.",
    create: () => ({ document: emptyDocument(), ui: initialUi }),
  },
  {
    id: "picker",
    journey: 1,
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
    journey: 3,
    row: "Row A · Conditions and typed values",
    title: "J3 · A1 · Conditions",
    caption: "Where, And, a grey Or group, Add filter, Use a variable.",
    create: () => ({
      document: journey3(fullQuery),
      ui: { ...initialUi, selectedId: SHIPMENTS },
    }),
  },
  {
    id: "j3-a2",
    journey: 3,
    row: "Row A · Conditions and typed values",
    title: "J3 · A2 · Operators follow the attribute's type",
    caption:
      "A date offers is, after, before, at or after, at or before, empty.",
    create: () => ({
      document: journey3(fullQuery),
      ui: {
        ...initialUi,
        selectedId: SHIPMENTS,
        openField: conditionMenu(SHIPMENTS, "menu", "operator"),
      },
    }),
  },
  {
    id: "j3-a3",
    journey: 3,
    row: "Row A · Conditions and typed values",
    title: "J3 · A3 · Date value editor",
    caption:
      "Today, Yesterday, a week or month ago, a number of days ago, or an exact date.",
    create: () => ({
      document: journey3({ conditions: [received({ value: "2026-10-01" })] }),
      ui: {
        ...initialUi,
        selectedId: SHIPMENTS,
        // "mention" here opens the exact-date calendar beside the menu.
        openField: conditionMenu(SHIPMENTS, "mention", "value"),
      },
    }),
  },
  {
    id: "j3-a4",
    journey: 3,
    row: "Row A · Conditions and typed values",
    title: "J3 · A4 · Status value: options list",
    caption: "A status picks one of its options.",
    create: () => ({
      document: journey3({
        conditions: [
          received(),
          {
            id: 2,
            propertyBaseUrl: property("Shipment", "Status"),
            operator: "equals",
            value: "Delivered",
          },
        ],
      }),
      ui: {
        ...initialUi,
        selectedId: SHIPMENTS,
        openField: conditionMenu(SHIPMENTS, "menu", "value", 2),
      },
    }),
  },
  {
    id: "j3-a5",
    journey: 3,
    row: "Row A · Conditions and typed values",
    title: "J3 · A5 · Entity value: search list",
    caption: "A link searches the linked entities.",
    create: () => ({
      document: journey3({
        conditions: [
          received(),
          {
            id: 2,
            propertyBaseUrl: property("Shipment", "Supplier"),
            operator: "equals",
            value: null,
          },
        ],
      }),
      ui: {
        ...initialUi,
        selectedId: SHIPMENTS,
        openField: conditionMenu(SHIPMENTS, "menu", "value", 2),
      },
    }),
  },
  {
    id: "j3-b1",
    journey: 3,
    row: "Row B · Values from variables",
    title: "J3 · B1 · Use a variable",
    caption: "Use a variable opens the same picker as @.",
    create: () => ({
      document: journey3({ conditions: [received({ value: null })] }, true),
      ui: {
        ...initialUi,
        selectedId: SHIPMENTS,
        openField: conditionMenu(SHIPMENTS, "menu", "footer"),
      },
    }),
  },
  {
    id: "j3-b2",
    journey: 3,
    row: "Row B · Values from variables",
    title: "J3 · B2 · Variable token in the value",
    caption: "The value reads Start › Review month.",
    create: () => ({
      document: journey3(
        {
          conditions: [
            received({
              value: null,
              valueSource: { kind: "flow-input", inputName: "reviewMonth" },
            }),
          ],
        },
        true,
      ),
      ui: { ...initialUi, selectedId: SHIPMENTS },
    }),
  },
  {
    id: "j3-b3",
    journey: 3,
    row: "Row B · Values from variables",
    title: "J3 · B3 · Earlier step token, long path collapsed",
    caption:
      "Step name first, the middle collapsed to …; hover shows the whole path.",
    create: () => ({
      document: journey3({ conditions: [received()] }),
      ui: { ...initialUi, selectedId: SUPPLIERS },
    }),
  },
  {
    id: "j3-c1",
    journey: 3,
    row: "Row C · Nothing fits yet",
    title: "J3 · C1 · Nothing fits yet",
    caption:
      "Nothing earlier gives a date: look it up, or add a flow input on Start.",
    create: () => ({
      document: journey3({ conditions: [received({ value: null })] }),
      ui: {
        ...initialUi,
        selectedId: SHIPMENTS,
        openField: conditionMenu(SHIPMENTS, "menu", "footer"),
      },
    }),
  },
  {
    id: "j3-c2",
    journey: 3,
    row: "Row C · Nothing fits yet",
    title: "J3 · C2 · Add a flow input on Start",
    caption: "Review month, a date, added to Start's inputs.",
    create: () => ({
      document: journey3({ conditions: [received({ value: null })] }, true),
      ui: { ...initialUi, selectedId: START_ID },
    }),
  },
  {
    id: "start",
    journey: 4,
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
    journey: 4,
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
    journey: 2,
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
    journey: 4,
    row: "For each and running",
    title: "Manual run form",
    caption: "The Run button's form, built from Start's inputs.",
    create: () => ({
      document: supplierReviewExample(),
      ui: { ...initialUi, runOpen: true },
    }),
  },
];

/** The journey sections on ↳ Current, in Figma order (file 69r6JuKZ2kAr61h7Ci40kh). */
export const journeyTitles: Record<ScreenState["journey"], string> = {
  1: "Journey 1 · Start a new flow",
  2: "Journey 2 · Build the first steps by hand",
  3: "Journey 3 · Where each input comes from",
  4: "Journey 4 · How a flow starts",
};

export const findScreenState = (id: string | null) =>
  screenStates.find((state) => state.id === id);

export { withStepAfterStart };
