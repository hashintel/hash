/**
 * Live builds of the Figma screens in `screens.ts`: each returns the page and state that reproduce one frame on
 * "↳ Journeys · 3 Nov". A screen missing here shows its Figma export instead.
 */
import { emptyDocument, type EditorDocument, START_ID } from "./document";
import { type EditorUi, initialUi } from "./editor-context";
import { purityCheckExample } from "./purity-check-example";
import { supplierReviewExample } from "./supplier-review-example";

import type { FlowListEntry } from "./home";

export type ScreenBuild = (
  | { page: "home"; flows: FlowListEntry[] }
  | { page: "editor"; document: EditorDocument; ui: EditorUi }
) & {
  /** What the user has just done in the frame (a menu opened, a field focused), replayed once the page is up. */
  act?: () => void | Promise<void>;
};

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

/** Where Figma's editor frames draw Start: 40 px into the canvas, its middle level with the canvas's. */
const startViewport: EditorUi["viewport"] = { left: 40, top: 349, zoom: 1 };

const editor = (
  document: EditorDocument,
  ui: Partial<EditorUi> = {},
): ScreenBuild => ({
  page: "editor",
  document,
  ui: { ...initialUi, viewport: startViewport, plainQuery: true, ...ui },
});

/** A new flow opens as J0.3 draws it. */
export const newFlowUi = (): EditorUi => ({
  ...initialUi,
  viewport: startViewport,
  plainQuery: true,
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
    act: () => {
      const title =
        globalThis.document.querySelector<HTMLInputElement>("[data-flow-name]");
      title?.focus();
      // Marks the field as being edited even when the window itself is not focused.
      if (title) {
        title.dataset.editing = "";
      }
      title?.setSelectionRange(title.value.length, title.value.length);
    },
  }),
  "J0.5": () => editor(emptyDocument(), { showPortAddOn: START_ID }),
  "J0.6": () => ({
    ...editor(emptyDocument(), { picker: { anchor: "toolbar" } }),
    act: async () => {
      click('[aria-label="Steps"] [role="tab"]:nth-child(2)');
      await pause(300);
      hover(byText('[role="menuitem"]', "Entities"));
      await pause(300);
      hover(byText('[role="menuitem"]', "Find entities"));
    },
  }),
  "J0.7": () => ({
    ...editor(emptyDocument()),
    act: async () => {
      click('[aria-label="Steps"] [role="tab"]:nth-child(2)');
      await pause(200);
      typeInto('[aria-label="Steps"] input', "em");
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

export const liveScreenIds = new Set(Object.keys(screenBuilds));
