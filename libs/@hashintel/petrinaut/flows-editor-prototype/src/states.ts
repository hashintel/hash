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
import { addLookupStep } from "./source-menu";
import { purityCheckExample } from "./purity-check-example";
import {
  CERTIFICATES,
  EACH_SUPPLIER,
  SHIPMENTS as CERTIFICATE_SHIPMENTS,
  SUPPLIERS as CERTIFICATE_SUPPLIERS,
  supplierCertificatesExample,
} from "./supplier-certificates-example";
import { supplierReviewExample } from "./supplier-review-example";

export type ScreenState = {
  id: string;
  title: string;
  /** What the screen shows, in one line. */
  caption: string;
  row: string;
  /** The Figma journey on ↳ Current this screen belongs to (1–4). */
  journey: 1 | 2 | 3 | 4;
  /** "home" opens the flows list instead of the editor (J1 · 1). */
  page?: "home";
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
 * Journey 3's flow (Figma J3, section 470:3681): Start, then "Shipments this month"; `withSuppliers` adds "Suppliers of those
 * shipments". `shipments` is the first step's query; `withInput` adds Start's Review month input.
 */
const journey3 = (
  shipments: Omit<QueryDraft, "entityTypeBaseUrl">,
  withInput = false,
  withSuppliers = false,
): EditorDocument => {
  const first = addStep(emptyDocument(), "queryEntities", {
    after: { stepId: START_ID, port: "next" },
  });
  const second = withSuppliers
    ? addStep(first.document, "queryEntities", {
        after: { stepId: first.stepId, port: "next" },
      })
    : { document: first.document, stepId: null };
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
      ...(suppliers
        ? {
            [fieldKey(suppliers, "query")]: {
              entityTypeBaseUrl: type("Supplier").baseUrl,
              conditions: [
                {
                  id: 1,
                  propertyBaseUrl: property("Supplier", "Shipment"),
                  operator: "isAnyOf" as const,
                  value: null,
                  valueSource: {
                    kind: "step-output" as const,
                    stepId: shipmentsId,
                    outputName: "entities",
                  },
                },
              ],
            },
          }
        : {}),
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
  mode: "menu" | "mention" | "custom" = "menu",
  part?: "operator" | "value" | "footer",
  row = 1,
) => ({
  stepId,
  inputName: `query:condition${row}${part ? `:${part}` : ""}`,
  mode,
});

/**
 * J3 C1b: the lookup step "Latest shipment" that the Look up in graph row adds before "Shipments this month", and
 * the Received date value reading it.
 */
const withLatestShipmentLookup = (): EditorDocument => {
  const base = journey3({ conditions: [received({ value: null })] });
  const { document, lookupId } = addLookupStep(base, SHIPMENTS, {
    name: "value",
    label: "Value",
    array: false,
    required: true,
    hasDefault: false,
    kinds: ["Date"],
  });
  const key = fieldKey(SHIPMENTS, "query");
  const query = document.queries[key]!;
  return {
    ...document,
    steps: document.steps.map((step) =>
      step.stepId === lookupId
        ? { ...step, description: "Latest shipment" }
        : step,
    ),
    queries: {
      ...document.queries,
      [key]: {
        ...query,
        conditions: query.conditions.map((row) => ({
          ...row,
          valueSource: {
            kind: "step-output" as const,
            stepId: lookupId,
            outputName: "entities",
          },
        })),
      },
    },
  };
};

/** J3 D1: Start, "Failed batches", and "Alert to the team" whose Subject is text followed by a value chip. */
const failedBatchesAlert = (): EditorDocument => {
  const found = addStep(emptyDocument(), "queryEntities", {
    after: { stepId: START_ID, port: "next" },
  });
  const email = addStep(found.document, "sendEmail", {
    after: { stepId: found.stepId, port: "next" },
  });
  return {
    ...email.document,
    startDescription: "Flow inputs",
    steps: email.document.steps.map((step) => ({
      ...step,
      description:
        step.stepId === found.stepId ? "Failed batches" : "Alert to the team",
    })),
    templates: {
      [fieldKey(email.stepId, "subject")]: [
        { kind: "text", text: "Failed batches this month: " },
        {
          kind: "ref",
          source: {
            kind: "step-output",
            stepId: found.stepId,
            outputName: "entities",
          },
        },
      ],
    },
  };
};

const recentSteps = ["queryEntities", "getFileFromUrl"];

const figmaStates: ScreenState[] = [
  {
    id: "j1-1",
    journey: 1,
    page: "home",
    row: "Adding nodes",
    title: "J1 · 1 · Flows · no flows yet",
    caption: "The flows list with nothing in it, and New flow.",
    create: () => ({ document: emptyDocument(), ui: initialUi }),
  },
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
    caption: "Recommended, recent (once there is history), browse all.",
    create: () => ({
      document: emptyDocument(),
      ui: { ...initialUi, picker: { anchor: "toolbar" } },
    }),
  },
  {
    id: "j1-4",
    journey: 1,
    row: "Adding nodes",
    title: "J1 · 4 · First step added · properties open",
    caption: "Find entities after Start, selected, with its properties.",
    create: () => {
      const { document, stepId } = withStepAfterStart("queryEntities");
      return { document, ui: { ...initialUi, selectedId: stepId } };
    },
  },
  {
    id: "j3-a1",
    journey: 3,
    row: "Row A · Conditions and typed values",
    title: "J3 · A1 · Conditions",
    caption: "Where, And, a grey Or group, Add filter.",
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
    id: "rel-d2",
    journey: 3,
    row: "Row A · Conditions and typed values",
    title: "Explore D2 · Custom interval",
    caption:
      "Custom… sets how far back, from step run time or flow start: 90 days ago.",
    create: () => ({
      document: journey3({
        conditions: [
          received({
            value: null,
            relative: {
              kind: "interval",
              amount: 90,
              unit: "days",
              direction: "ago",
              anchor: "stepRun",
            },
          }),
        ],
      }),
      ui: {
        ...initialUi,
        selectedId: SHIPMENTS,
        // "custom" opens the exact-date calendar with the Custom… interval popover beside it.
        openField: conditionMenu(SHIPMENTS, "custom", "value"),
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
      document: journey3({ conditions: [received()] }, false, true),
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
    id: "j3-c1b",
    journey: 3,
    row: "Row C · Nothing fits yet",
    title: "J3 · C1b · After Lookup in graph · Find entities step inserted",
    caption:
      "Latest shipment is added before Shipments this month; the date reads its Received date.",
    create: () => ({
      document: withLatestShipmentLookup(),
      ui: { ...initialUi, selectedId: SHIPMENTS },
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
    id: "j3-d1",
    journey: 3,
    row: "Row D · Open values",
    title: "J3 · D1 · Open value · typed text with a variable",
    caption:
      "A Subject of typed text, then a value chip, on one wrapping line.",
    create: () => {
      const document = failedBatchesAlert();
      return {
        document,
        ui: { ...initialUi, selectedId: document.steps.at(-1)!.stepId },
      };
    },
  },
  {
    id: "j4-a1",
    journey: 4,
    row: "Triggers listed on Start",
    title: "J4 · A1 · Start holds the inputs",
    caption:
      "Start lists what starts the flow, under Started by, with Add trigger.",
    create: () => ({
      document: purityCheckExample(),
      ui: { ...initialUi, selectedId: START_ID },
    }),
  },
  {
    id: "j4-a2",
    journey: 4,
    row: "Triggers listed on Start",
    title: "J4 · A2 · A trigger fills Start's inputs",
    caption:
      "A trigger opened from Started by: Start stays selected, the panel shows the trigger.",
    create: () => ({
      document: purityCheckExample(),
      ui: { ...initialUi, selectedId: START_ID, triggerId: "shipmentChanges" },
    }),
  },
  {
    id: "j4-c1",
    journey: 4,
    row: "Triggers listed on Start",
    title: "J4 · C1 · Triggers listed on Start, not on the canvas",
    caption:
      "The canvas draws Start and the steps only, however many triggers.",
    create: () => ({
      document: purityCheckExample(),
      ui: { ...initialUi, selectedId: START_ID },
    }),
  },
  {
    id: "j4-c2",
    journey: 4,
    row: "Triggers listed on Start",
    title: "J4 · C2 · Open a trigger from Started by",
    caption: "Same as A2: click a Started by row to open its form.",
    create: () => ({
      document: purityCheckExample(),
      ui: { ...initialUi, selectedId: START_ID, triggerId: "shipmentChanges" },
    }),
  },
  {
    id: "j2-a1",
    journey: 2,
    row: "Row A · A step after a step",
    title: "J2 · A1 · Hover + after Shipments this month",
    caption: "The + beside the selected step adds the next one.",
    create: () => ({
      document: supplierCertificatesExample("shipments"),
      ui: { ...initialUi, selectedId: CERTIFICATE_SHIPMENTS },
    }),
  },
  {
    id: "j2-a2",
    journey: 2,
    row: "Row A · A step after a step",
    title: "J2 · A2 · The step menu opens from that step",
    caption: "Recent steps, then Browse all.",
    create: () => ({
      document: supplierCertificatesExample("shipments"),
      ui: {
        ...initialUi,
        selectedId: CERTIFICATE_SHIPMENTS,
        recent: recentSteps,
        picker: {
          anchor: "port",
          after: { stepId: CERTIFICATE_SHIPMENTS, port: "next" },
        },
      },
    }),
  },
  {
    id: "j2-b1",
    journey: 2,
    row: "Row B · A for each",
    title: "J2 · B1 · Suppliers of those shipments added after it",
    caption: "The second Find entities reads the first one's list.",
    create: () => ({
      document: supplierCertificatesExample("suppliers"),
      ui: { ...initialUi, selectedId: CERTIFICATE_SUPPLIERS },
    }),
  },
  {
    id: "j2-b2",
    journey: 2,
    row: "Row B · A for each",
    title: "J2 · B2 · + after it · Flow control › For each",
    caption: "The step menu from the second step.",
    create: () => ({
      document: supplierCertificatesExample("suppliers"),
      ui: {
        ...initialUi,
        selectedId: CERTIFICATE_SUPPLIERS,
        recent: recentSteps,
        picker: {
          anchor: "port",
          after: { stepId: CERTIFICATE_SUPPLIERS, port: "next" },
        },
      },
    }),
  },
  {
    id: "j2-c1",
    journey: 2,
    row: "Row C · The list",
    title: "J2 · C1 · An empty For each · List is required",
    caption: "The List menu offers the lists from earlier steps.",
    create: () => ({
      document: supplierCertificatesExample("empty-for-each"),
      ui: {
        ...initialUi,
        selectedId: EACH_SUPPLIER,
        openField: { stepId: EACH_SUPPLIER, inputName: "over", mode: "menu" },
      },
    }),
  },
  {
    id: "j2-c2",
    journey: 2,
    row: "Row C · The list",
    title: "J2 · C2 · List picked · the box is named for it",
    caption: "The box reads For each supplier.",
    create: () => ({
      document: supplierCertificatesExample("for-each-list"),
      ui: { ...initialUi, selectedId: EACH_SUPPLIER },
    }),
  },
  {
    id: "j2-d1",
    journey: 2,
    row: "Row D · Inside the box",
    title: "J2 · D1 · A step inside uses supplier",
    caption: "Fetch file's URL reads the supplier.",
    create: () => ({
      document: supplierCertificatesExample("fetch-file"),
      ui: { ...initialUi, selectedId: CERTIFICATES },
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
      document: purityCheckExample(),
      ui: { ...initialUi, runOpen: true },
    }),
  },
];

/**
 * Per-state panel switches: J3 and rel-d2 (a J3 Explore screen) draw no "Inputs" header; J2's query reads "Add
 * condition" with no "Where".
 */
export const screenStates: ScreenState[] = figmaStates.map((state) => {
  const hideInputsHeader = state.journey === 3;
  const plainQuery = state.journey <= 2;
  return hideInputsHeader || plainQuery
    ? {
        ...state,
        create: () => {
          const created = state.create();
          return {
            ...created,
            ui: { ...created.ui, hideInputsHeader, plainQuery },
          };
        },
      }
    : state;
});

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
