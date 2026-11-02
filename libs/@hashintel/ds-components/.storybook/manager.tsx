import { BookIcon } from "@storybook/icons";
// Default import + React.useState: the manager bundle compiles JSX with the
// classic transform, so React must be in scope (and read, for tsc).
import React from "react";
import { IconButton } from "storybook/internal/components";
import { GLOBALS_UPDATED, SET_GLOBALS } from "storybook/internal/core-events";
import { addons, types, type API } from "storybook/manager-api";
import { create } from "storybook/theming/create";

import { resolveTheme, systemDark } from "./resolve-theme";

const docsModeAddonId = "hash/docs-mode";
const docsModeStorageKey = "hash-ds-docs-mode";

const isDocsModeEnabled = () =>
  globalThis.localStorage.getItem(docsModeStorageKey) === "true";

/** Docs mode shows only the unattached MDX docs pages (the "Docs" sidebar
 * section); story mode shows everything else. The filter only affects the
 * sidebar, so a page stays rendered if the mode changes underneath it. */
const applyDocsMode = (api: API, enabled: boolean) => {
  void api.experimental_setFilter(docsModeAddonId, (item) =>
    enabled ? item.type === "docs" : item.type !== "docs",
  );
};

const DocsModeTool = ({ api }: { api: API }) => {
  const [enabled, setEnabled] = React.useState(isDocsModeEnabled);

  return (
    <IconButton
      key="docs-mode"
      title={enabled ? "Switch to story mode" : "Switch to docs mode"}
      active={enabled}
      onClick={() => {
        const next = !enabled;
        globalThis.localStorage.setItem(docsModeStorageKey, String(next));
        setEnabled(next);
        applyDocsMode(api, next);
      }}
    >
      <BookIcon />
    </IconButton>
  );
};

addons.register(docsModeAddonId, (api) => {
  applyDocsMode(api, isDocsModeEnabled());

  addons.add(`${docsModeAddonId}/tool`, {
    type: types.TOOL,
    title: "Docs mode",
    match: () => true,
    render: () => <DocsModeTool api={api} />,
  });
});

const brandTitle = "HASH Design System";
const managerThemes = {
  light: create({ base: "light", brandTitle }),
  dark: create({ base: "dark", brandTitle }),
};

/** Retheme the manager chrome from the preview's `theme` toolbar global
 * (`auto` tracks the OS preference live). The global arrives over the
 * channel: SET_GLOBALS when the preview boots, GLOBALS_UPDATED on toggles. */
addons.register("hash/manager-theme", (api) => {
  let selectedTheme = "light";

  const applyTheme = () => {
    api.setOptions({ theme: managerThemes[resolveTheme(selectedTheme)] });
  };
  const onGlobals = (payload: { globals?: Record<string, unknown> }) => {
    const theme = payload.globals?.["theme"];
    if (typeof theme === "string" && theme.length > 0) {
      selectedTheme = theme;
    }
    applyTheme();
  };

  const channel = addons.getChannel();
  channel.on(SET_GLOBALS, onGlobals);
  channel.on(GLOBALS_UPDATED, onGlobals);
  systemDark.addEventListener("change", applyTheme);
});

addons.setConfig({
  theme: managerThemes.light,
  panelPosition: window.matchMedia("(min-width: 1401px)").matches
    ? "right"
    : "bottom",
});
