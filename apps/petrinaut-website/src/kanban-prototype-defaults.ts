// PROTOTYPE ONLY — REMOVE BEFORE ANY PR OR MERGE (branch
// as/des-226-kanban-board-setup-prototype). Delete this file, its import in
// `main.tsx` and `VITE_KANBAN_PROTOTYPE_DEFAULTS` in `vite-env.d.ts`.
//
// Does nothing unless `VITE_KANBAN_PROTOTYPE_DEFAULTS=1` is set, which only
// the git-ignored `.env.development.local` in the prototype worktree does.
// When set, each page load turns on status views, skips the walkthrough and
// opens the Production with Machine Failure example, refreshed whenever the
// example's definition changes.

import { productionMachines } from "@hashintel/petrinaut-core/examples";

const USER_SETTINGS_KEY = "petrinaut:user-settings";
const DOCUMENTS_KEY = "petrinaut-sdcpn";
const FINGERPRINT_KEY = "kanban-prototype-defaults:example-fingerprint";
const DOCUMENT_ID = "kanban-prototype-machines";

const readJson = (key: string): Record<string, unknown> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

export const applyKanbanPrototypeDefaults = (): void => {
  if (import.meta.env.VITE_KANBAN_PROTOTYPE_DEFAULTS !== "1") {
    return;
  }
  try {
    localStorage.setItem(
      USER_SETTINGS_KEY,
      JSON.stringify({
        ...readJson(USER_SETTINGS_KEY),
        enableStatusViews: true,
        showWalkthroughOnInit: false,
      }),
    );

    const definition = JSON.stringify(productionMachines.petriNetDefinition);
    const documents = readJson(DOCUMENTS_KEY);
    const existing = documents[DOCUMENT_ID] as
      | Record<string, unknown>
      | undefined;
    const stale =
      !existing || localStorage.getItem(FINGERPRINT_KEY) !== definition;
    documents[DOCUMENT_ID] = {
      ...(stale
        ? {
            id: DOCUMENT_ID,
            title: productionMachines.title,
            sdcpn: productionMachines.petriNetDefinition,
          }
        : existing),
      // Newest document opens first.
      lastUpdated: new Date().toISOString(),
    };
    localStorage.setItem(DOCUMENTS_KEY, JSON.stringify(documents));
    localStorage.setItem(FINGERPRINT_KEY, definition);
  } catch {
    // Storage blocked: the app starts with its normal defaults.
  }
};
