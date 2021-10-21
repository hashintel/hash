import { history as historyPlugin } from "prosemirror-history";
import { Schema } from "prosemirror-model";
import { EditorView } from "prosemirror-view";

/**
 * We setup two versions of the history plugin, because we occasionally
 * temporarily want to ensure that all updates made between two points are
 * absorbed into a single history item. We need a more sophisticated way of
 * manipulating history items though.
 */
const historyPluginWithTracking = historyPlugin();
const historyPluginWithoutTracking = historyPlugin({ newGroupDelay: Infinity });

export const history = {
  plugin: historyPluginWithTracking,

  enableTracking: (view: EditorView<Schema>) => {
    view.updateState(
      view.state.reconfigure({
        plugins: view.state.plugins.map((plugin) =>
          plugin === historyPluginWithoutTracking
            ? historyPluginWithTracking
            : plugin
        ),
      })
    );
  },

  disableTracking: (view: EditorView<Schema>) => {
    // Ensure that any changes to the document made are kept within a
    // single undo item
    view.updateState(
      view.state.reconfigure({
        plugins: view.state.plugins.map((plugin) =>
          plugin === historyPluginWithTracking
            ? historyPluginWithoutTracking
            : plugin
        ),
      })
    );
  },
};
