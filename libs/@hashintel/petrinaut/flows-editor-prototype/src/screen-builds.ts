/**
 * Live builds of the Figma screens in `screens.ts`: each returns the page and state that reproduce one frame on
 * "↳ Journeys · 3 Nov". A screen missing here shows its Figma export instead.
 */
import {
  addStep,
  emptyDocument,
  type EditorDocument,
  fieldKey,
  START_ID,
} from "./document";
import { type EditorUi, initialUi } from "./editor-context";
import { purityCheckExample } from "./purity-check-example";
import { signOffAt, suppliers } from "./run-history";
import { findScreenState } from "./states";
import {
  CERTIFICATES,
  EACH_SUPPLIER,
  SHIPMENTS,
  SUPPLIERS,
  supplierCertificatesExample,
} from "./supplier-certificates-example";
import {
  supplierReviewExample,
  supplierReviewRunExample,
} from "./supplier-review-example";

import type { FlowListEntry } from "./home";

export type ScreenBuild = (
  | { page: "home"; flows: FlowListEntry[] }
  | { page: "editor"; document: EditorDocument; ui: EditorUi }
) & {
  /** What the user has just done in the frame (a menu opened, a field focused), replayed once the page is up. */
  act?: () => void | Promise<void>;
};

/** Where Figma's editor frames draw Start: 40 px into the canvas, its middle level with the canvas's. */
const startViewport: EditorUi["viewport"] = { left: 40, top: 349, zoom: 1 };

const editor = (
  document: EditorDocument,
  ui: Partial<EditorUi> = {},
): ScreenBuild => ({
  page: "editor",
  document,
  ui: { ...initialUi, viewport: startViewport, ...ui },
});

const pause = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** Clicks the first element matching `selector`, as a person would. */
const click = (selector: string) => {
  const element = globalThis.document.querySelector<HTMLElement>(selector);
  element?.click();
  return element;
};

/** Right-clicks an element at a window point. */
const rightClick = async (
  selector: string,
  clientX: number,
  clientY: number,
) => {
  // React Flow draws connections only once it has measured the steps, so wait for the target (up to 3 s).
  for (
    let tries = 0;
    tries < 30 && !globalThis.document.querySelector(selector);
    tries++
  ) {
    await pause(100);
  }
  await pause(100);
  globalThis.document.querySelector(selector)?.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX,
      clientY,
    }),
  );
};

/** Types into a text field the way React hears it. */
const typeInto = (selector: string, text: string) => {
  const input = globalThis.document.querySelector<HTMLInputElement>(selector);
  if (!input) {
    return;
  }
  input.focus();
  Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set?.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
};

/** Points at a DS menu row, which opens its submenu. */
const hover = (element: Element | null | undefined) => {
  for (const type of ["pointerover", "pointerenter", "pointermove"]) {
    element?.dispatchEvent(
      new PointerEvent(type, { bubbles: true, pointerType: "mouse" }),
    );
  }
};

const byText = (selector: string, text: string) =>
  [...globalThis.document.querySelectorAll(selector)].find(
    (element) => element.textContent?.trim() === text,
  );

const recentSteps = ["queryEntities", "getFileFromUrl"];

/** J1.1: Find entities just added after Start, selected. */
const firstStep = () =>
  addStep(emptyDocument(), "queryEntities", {
    after: { stepId: START_ID, port: "next" },
  });

/** J2.13 and J2.13a: a new Find entities after a Start that takes an entity type as a flow input. */
const typeFromStart = (picked: boolean) => {
  const { document, stepId } = addStep(
    {
      ...emptyDocument(),
      inputs: [
        {
          name: "entityType",
          label: "Entity type",
          payloadKind: "VersionedUrl",
          array: false,
          required: true,
        },
      ],
    },
    "queryEntities",
    { after: { stepId: START_ID, port: "next" } },
  );
  return {
    stepId,
    document: picked
      ? {
          ...document,
          queries: {
            ...document.queries,
            [fieldKey(stepId, "query")]: {
              ...document.queries[fieldKey(stepId, "query")],
              conditions: [],
              entityTypeSource: {
                kind: "flow-input" as const,
                inputName: "entityType",
              },
            },
          },
        }
      : document,
  };
};

/** J1.4's frame draws its cards at 90% and labels that 100%; Start 16 px into the canvas, so they clear the panel. */
const ninetyPercent: Partial<EditorUi> = {
  viewport: { left: 16, top: 346, zoom: 0.9 },
  zoomBase: 0.9,
};

/** J1.7–J1.19 draw the four-step flow at 62%, Start 17 px into the canvas so the For each clears the panel (3 Nov). */
const sixtyTwoPercent: Partial<EditorUi> = {
  viewport: { left: 17, top: 364, zoom: 0.62 },
};

/** J2.4–J2.8's flow: Start, then "Shipments this month" with one Received date row, after Sep 30, 2026. */
const shipmentsAfterSeptember = (): EditorDocument => {
  const { document } = findScreenState("j3-a3")!.create();
  const key = fieldKey(SHIPMENTS, "query");
  const query = document.queries[key]!;
  return {
    ...document,
    queries: {
      ...document.queries,
      [key]: {
        ...query,
        conditions: query.conditions.map((row, index) =>
          index === 0 ? { ...row, value: "2026-09-30" } : row,
        ),
      },
    },
  };
};

/** J2.5–J2.8 draw Start 156 px into the canvas, lower than J1 does. */
const queryViewport: Partial<EditorUi> = {
  viewport: { left: 156, top: 389, zoom: 1 },
};

/** Presses the pointer on an element, for DS menus that open on pointer down. */
const press = (selector: string) => {
  const element = globalThis.document.querySelector<HTMLElement>(selector);
  if (element) {
    for (const type of [
      "pointerdown",
      "mousedown",
      "pointerup",
      "mouseup",
      "click",
    ]) {
      element.dispatchEvent(
        new (type.startsWith("pointer") ? PointerEvent : MouseEvent)(type, {
          bubbles: true,
          cancelable: true,
          button: 0,
        }),
      );
    }
  }
  return element;
};

/** A new flow opens as J0.3 draws it. */
export const newFlowUi = (): EditorUi => ({
  ...initialUi,
  viewport: startViewport,
});

/** J0.2's list: the flow just made, and two older ones. */
export const sampleFlows = (): FlowListEntry[] => [
  { id: "untitled", document: emptyDocument(), lastEdited: "Just now" },
  {
    id: "supplierReview",
    document: supplierReviewExample(),
    lastEdited: "Yesterday",
  },
  { id: "purityCheck", document: purityCheckExample(), lastEdited: "28 Oct" },
];

export const screenBuilds: Record<string, () => ScreenBuild> = {
  "J0.1": () => ({ page: "home", flows: [] }),
  "J0.2": () => ({ page: "home", flows: sampleFlows() }),
  "J0.3": () => editor(emptyDocument()),
  "J0.4": () => ({
    ...editor(emptyDocument("Monthly supplier review")),
    act: async () => {
      click('[aria-label="Rename flow"]');
      await pause(50);
      const title =
        globalThis.document.querySelector<HTMLInputElement>("[data-flow-name]");
      title?.focus();
      title?.setSelectionRange(title.value.length, title.value.length);
    },
  }),
  "J0.5": () => editor(emptyDocument(), { showPortAddOn: START_ID }),
  "J0.6": () => ({
    ...editor(emptyDocument(), {
      picker: { anchor: "toolbar" },
      leftPanel: "add",
    }),
    act: async () => {
      await pause(300);
      hover(byText('[role="menuitem"]', "Entities"));
      await pause(300);
      hover(byText('[role="menuitem"]', "Find entities"));
    },
  }),
  "J0.7": () => ({
    ...editor(emptyDocument(), { leftPanel: "add" }),
    act: () => {
      typeInto('[aria-label="Add a step"] input', "em");
    },
  }),
  "J0.10": () =>
    editor(emptyDocument(), {
      picker: { after: { stepId: START_ID, port: "next" }, anchor: "port" },
      recent: recentSteps,
      showPortAddOn: START_ID,
    }),
  "J0.11": () => ({
    ...editor(emptyDocument(), {
      picker: { after: { stepId: START_ID, port: "next" }, anchor: "port" },
      recent: recentSteps,
      showPortAddOn: START_ID,
    }),
    act: () => {
      typeInto('input[placeholder="Search"]', "ask");
    },
  }),
  "J1.1": () => {
    const { document, stepId } = firstStep();
    return editor(document, { selectedId: stepId });
  },
  "J1.2": () => {
    const { document, stepId } = firstStep();
    return {
      ...editor(document, { selectedId: stepId }),
      act: () => {
        typeInto('[aria-label="Step description"]', "Shipments this month");
      },
    };
  },
  "J1.3": () =>
    editor(supplierCertificatesExample("shipments"), {
      selectedId: SHIPMENTS,
      showPortAddOn: SHIPMENTS,
    }),
  "J1.4": () => ({
    ...editor(supplierCertificatesExample("suppliers"), {
      ...ninetyPercent,
      selectedId: SUPPLIERS,
      showPortAddOn: SUPPLIERS,
      recent: recentSteps,
      picker: { anchor: "port", after: { stepId: SUPPLIERS, port: "next" } },
    }),
    act: async () => {
      await pause(200);
      hover(byText('[role="menuitem"]', "Flow control"));
      await pause(300);
      hover(byText('[role="menuitem"]', "For each"));
    },
  }),
  "J1.7": () =>
    editor(supplierCertificatesExample("empty-for-each"), {
      ...sixtyTwoPercent,
      selectedId: EACH_SUPPLIER,
      openField: { stepId: EACH_SUPPLIER, inputName: "over", mode: "menu" },
    }),
  "J1.8": () =>
    editor(supplierCertificatesExample("for-each-list"), {
      ...sixtyTwoPercent,
      selectedId: EACH_SUPPLIER,
    }),
  "J1.9": () =>
    editor(supplierCertificatesExample("for-each-list"), {
      ...sixtyTwoPercent,
      selectedId: EACH_SUPPLIER,
      recent: recentSteps,
      picker: { parentId: EACH_SUPPLIER, anchor: "group" },
    }),
  "J1.10": () =>
    editor(supplierCertificatesExample("fetch-file"), {
      ...sixtyTwoPercent,
      selectedId: CERTIFICATES,
    }),
  "J1.13": () => ({
    ...editor(supplierCertificatesExample("fetch-file"), {
      ...sixtyTwoPercent,
      selectedId: EACH_SUPPLIER,
    }),
    act: () => {
      click('[aria-label="Collapse all"]');
    },
  }),
  // J1.16, J1.20, J1.21: the right-click menus on a step, a connection and a port, as a person right-clicks them.
  "J1.16": () => {
    const { document, stepId } = firstStep();
    return {
      ...editor(document, { selectedId: stepId }),
      act: () =>
        rightClick(`.react-flow__node[data-id="${stepId}"] > *`, 702, 468),
    };
  },
  "J1.20": () => {
    const { document, stepId } = firstStep();
    return {
      ...editor(document, { selectedId: stepId }),
      act: () => rightClick(".react-flow__edge-interaction", 500, 476),
    };
  },
  "J1.21": () => {
    const { document, stepId } = firstStep();
    return {
      ...editor(document, { selectedId: stepId }),
      act: () =>
        rightClick(
          `.react-flow__node[data-id="${START_ID}"] .react-flow__handle.source`,
          470,
          476,
        ),
    };
  },
  "J1.19": () => ({
    ...editor(supplierCertificatesExample("empty-for-each"), {
      ...sixtyTwoPercent,
      selectedId: EACH_SUPPLIER,
    }),
    act: () => {
      press('[aria-label="Organize"]');
    },
  }),
  // J2.2 and J1.1 are the same frame: a new Find entities, its type left at Any.
  "J2.2": () => {
    const { document, stepId } = firstStep();
    return editor(document, { selectedId: stepId });
  },
  "J2.4": () =>
    editor(shipmentsAfterSeptember(), {
      selectedId: SHIPMENTS,
      showPortAddOn: SHIPMENTS,
    }),
  // J2.13: the Entity type menu open, with Start's Entity type under "From earlier steps".
  "J2.13": () => {
    const { document, stepId } = typeFromStart(false);
    return editor(document, {
      selectedId: stepId,
      openField: { stepId, inputName: "entityType", mode: "menu" },
    });
  },
  "J2.13a": () => {
    const { document, stepId } = typeFromStart(true);
    return editor(document, { selectedId: stepId });
  },
  // J2.6 keeps the whole query under the popover: Received date, Purity, and the Or group of suppliers.
  "J2.6": () =>
    editor(findScreenState("j3-a1")!.create().document, {
      ...queryViewport,
      selectedId: SHIPMENTS,
      // "mention" opens the exact-date calendar beside the relative presets.
      openField: {
        stepId: SHIPMENTS,
        inputName: "query:condition1:value",
        mode: "mention",
      },
    }),
  "J0.12": () => ({
    ...editor(emptyDocument()),
    act: () => {
      press('[aria-label="More"]');
    },
  }),
  "J0.13": () => ({
    ...editor(emptyDocument()),
    act: () => {
      press('[aria-label="Zoom"]');
    },
  }),
};

/**
 * J6 (4 Nov sync): the run view draws the flow at 45%: Start's top-left 148 px into the canvas and 402 px down, the
 * cards at 0.46 (the bottom bar reads 45%).
 */
const runViewport: Partial<EditorUi> = {
  viewport: { left: 147.5, top: 401.5, zoom: 0.46 },
  zoomBase: 0.46 / 0.45,
};

/** Run 17 on J6.2, 14 of 20 suppliers in: 1:02 on its clock. */
const inTheLoop = 62;

const runScreen = (
  runId: number | null,
  ui: Partial<EditorUi> = {},
  run17: { seconds: number; pinned: boolean } = {
    seconds: inTheLoop,
    pinned: false,
  },
): ScreenBuild =>
  editor(supplierReviewRunExample(), {
    ...runViewport,
    runs: run17,
    history: { runId },
    ...ui,
  });

Object.assign(screenBuilds, {
  // J6.0: History opens on all runs; Run 17 is 1:02 in and keeps running.
  "J6.0": () => runScreen(null),
  // J6.1: Run 17 just started, 0:04 in, at Find active suppliers; it runs on its own from here.
  "J6.1": () => runScreen(17, {}, { seconds: 4, pinned: false }),
  // J6.2 and J6.3 are moments of the live run, held still.
  "J6.2": () => runScreen(17, {}, { seconds: inTheLoop, pinned: true }),
  "J6.3": () =>
    runScreen(
      17,
      {},
      { seconds: signOffAt(suppliers.length) + 42, pinned: true },
    ),
  "J6.4": () => runScreen(16),
  "J6.5": () => runScreen(15),
  "J6.6": () => runScreen(13),
  "J6.7": () =>
    runScreen(16, {
      selectedId: "fetchCertificate",
      selectedIds: ["fetchCertificate"],
    }),
  "J6.8": () => ({
    ...runScreen(16),
    act: () => {
      press("[data-run-picker]");
    },
  }),
  "J6.9": () => runScreen(16, { runLog: false }),
  "J6.10": () => runScreen(16, { runLog: true }),
} satisfies Record<string, () => ScreenBuild>);

export const liveScreenIds = new Set(Object.keys(screenBuilds));
