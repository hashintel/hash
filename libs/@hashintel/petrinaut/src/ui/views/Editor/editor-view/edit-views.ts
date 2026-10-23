/**
 * The edit views the selector offers: Canvas, Definitions, then the views of
 * the running plugins. A location naming a view no running plugin provides
 * resolves to Canvas, so switching a plugin off never leaves a blank editor.
 */

import type { EditViewMode } from "../../../../react/state/editor-context";
import type { PluginEditView } from "../../../plugins/plugins-provider";

export type EditViewItem = { label: string; value: EditViewMode };

export const builtInEditViews: readonly EditViewItem[] = [
  { label: "Canvas", value: "canvas" },
  { label: "Definitions", value: "definitions" },
];

export const editViewItems = (
  pluginViews: readonly PluginEditView[],
): EditViewItem[] => [
  ...builtInEditViews,
  ...pluginViews.map((view) => ({ label: view.label, value: view.id })),
];

export const resolveEditView = (
  view: EditViewMode,
  pluginViews: readonly PluginEditView[],
): EditViewMode =>
  view === "canvas" ||
  view === "definitions" ||
  pluginViews.some((candidate) => candidate.id === view)
    ? view
    : "canvas";

/** The selector's width: room for each tab, in the units the layout uses. */
export const editViewSelectorWidth = (itemCount: number): number =>
  Math.max(160, itemCount * 80);
