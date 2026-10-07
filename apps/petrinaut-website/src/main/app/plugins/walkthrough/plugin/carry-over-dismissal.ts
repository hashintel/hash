const pluginKey = "petrinaut:plugin:website.walkthrough";
const editorKey = "petrinaut:user-settings";

/**
 * Keeps a dismissal stored before the welcome guide was a plugin. The editor
 * stored it as `showWalkthroughOnInit: false` among its own settings and drops
 * that key on its first write. Every route can mount an editor, and routes
 * load on demand, so the app entry runs this before rendering any route. It
 * writes nothing once the plugin has stored its own setting.
 */
export const carryOverWalkthroughDismissal = () => {
  try {
    if (localStorage.getItem(pluginKey) !== null) {
      return;
    }
    const editorSettings: unknown = JSON.parse(
      localStorage.getItem(editorKey) ?? "{}",
    );
    if (
      typeof editorSettings === "object" &&
      editorSettings !== null &&
      "showWalkthroughOnInit" in editorSettings &&
      editorSettings.showWalkthroughOnInit === false
    ) {
      localStorage.setItem(pluginKey, JSON.stringify({ showOnInit: false }));
    }
  } catch {
    // Storage is unavailable or the editor's settings are not JSON: the guide shows.
  }
};
