import { use } from "react";

import { EditorContext } from "../../../react/state/editor-context";
import { useInstalledPlugins } from "../../plugins/installed-plugins";
import { selectPluginEditViews } from "../../plugins/plugin";

/**
 * Which workspace the editor shows. The Canvas and the Definitions view are
 * built in; plugins contribute the other edit views. A view the location
 * names but nothing provides falls back to the Canvas, so a stale URL still
 * shows the net. The editor's layout and its Canvas commands both read this,
 * so the commands are available whenever the Canvas is.
 */
export const useEditWorkspace = () => {
  const { globalMode, editViewMode } = use(EditorContext);
  const installedEditViews = selectPluginEditViews(useInstalledPlugins());
  const activeEditView =
    globalMode === "edit"
      ? installedEditViews.find(({ view }) => view.id === editViewMode)?.view
      : undefined;
  const isDefinitionsWorkspace =
    globalMode === "edit" && editViewMode === "definitions";
  const isCanvasWorkspace =
    globalMode === "actual" ||
    (globalMode === "edit" &&
      !isDefinitionsWorkspace &&
      activeEditView === undefined);

  return {
    installedEditViews,
    activeEditView,
    isDefinitionsWorkspace,
    isCanvasWorkspace,
  };
};
