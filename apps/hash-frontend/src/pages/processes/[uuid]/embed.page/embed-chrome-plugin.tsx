import { Box } from "@mui/material";
import { createContext, use } from "react";

import { Button, Icon, TextInput } from "@hashintel/ds-components";
import { definePetrinautPlugin } from "@hashintel/petrinaut";

import { ChartNetworkRegularIcon } from "../../../../shared/icons/chart-network-regular-icon";
import { VersionPicker } from "./version-picker";

import type { RevisionSummary } from "../../shared/messages";

/**
 * The grays HASH's breadcrumbs use elsewhere in the app: crumb text (and
 * the crumb's icon / the process title) in the darker grey-blue, the
 * chevron separators lighter. Neither the MUI theme (closest:
 * `palette.gray[70]` #64778C / `palette.gray[50]` #91A5BA) nor the
 * ds-components palette has exact tokens for these, so they're pinned here.
 */
const BREADCRUMB_TEXT_COLOR = "#677789";
const BREADCRUMB_CHEVRON_COLOR = "#95a5b8";

/**
 * What the embed's top-bar items read: the page owns this state and provides
 * it above the editor, so the plugin itself stays a stable module constant.
 */
export type EmbedChrome = {
  title: string;
  onTitleChange: (title: string) => void;
  readonly: boolean;
  isDirty: boolean;
  persistPending: boolean;
  saveLabel: string;
  revisions: RevisionSummary[];
  loadedRevisionTime: string | null;
  onNavigateBack: () => void;
  onSave: () => void;
  onLoadRevision: (revision: RevisionSummary) => void;
};

export const EmbedChromeContext = createContext<EmbedChrome | null>(null);

/**
 * HASH-style breadcrumbs at the start of Petrinaut's top bar, so the embed
 * shows a single bar. The editable process title is the final crumb, tinted
 * to match, and renames in place through the page's title state.
 */
const EmbedBreadcrumbs = () => {
  const chrome = use(EmbedChromeContext);
  if (!chrome) {
    return null;
  }

  return (
    <Box
      sx={{
        alignItems: "center",
        /** Inherited by the chevron separator's `currentColor` fill. */
        color: BREADCRUMB_CHEVRON_COLOR,
        display: "flex",
        gap: 0.5,
        minWidth: 0,
      }}
    >
      <Button
        size="sm"
        variant="ghost"
        onClick={chrome.onNavigateBack}
        prefix={
          <ChartNetworkRegularIcon
            style={{ color: BREADCRUMB_TEXT_COLOR, fontSize: 14 }}
          />
        }
      >
        {/*
         * The ds Button recipe sets its own text color, and the editor's
         * layer-polyfilled Panda bundle compiles that rule to a
         * specificity that beats host emotion classes (FE-1228) — inline
         * styles are the only reliable channel, hence the styled span
         * and the inline-styled icon above.
         */}
        <span style={{ color: BREADCRUMB_TEXT_COLOR }}>Processes</span>
      </Button>
      <Icon name="chevronRight" size="xs" />
      <TextInput
        variant="subtle"
        size="sm"
        value={chrome.title}
        onChange={chrome.onTitleChange}
        placeholder="Process"
        style={{
          color: BREADCRUMB_TEXT_COLOR,
          fontWeight: 500,
          margin: "0 8px",
        }}
      />
    </Box>
  );
};

/** Version picker and Save/Create at the end of the top bar, for an editable net. */
const EmbedActions = () => {
  const chrome = use(EmbedChromeContext);
  if (!chrome || chrome.readonly) {
    return null;
  }
  const {
    isDirty,
    loadedRevisionTime,
    onLoadRevision,
    onSave,
    persistPending,
    revisions,
    saveLabel,
  } = chrome;

  return (
    <>
      <VersionPicker
        revisions={revisions}
        loadedRevisionTime={loadedRevisionTime}
        isDirty={isDirty && !persistPending}
        onLoadRevision={onLoadRevision}
      />
      <Button
        size="sm"
        onClick={onSave}
        disabled={!isDirty || persistPending}
        loading={persistPending}
        tooltip={!isDirty && !persistPending ? "No changes to save" : undefined}
      >
        {saveLabel}
      </Button>
    </>
  );
};

export const embedChromePlugin = definePetrinautPlugin({
  id: "hash.process-embed",
  name: "HASH process embed chrome",
  topBarItems: [
    {
      id: "hash.process-embed.breadcrumbs",
      placement: "top-bar-start",
      component: EmbedBreadcrumbs,
    },
    {
      id: "hash.process-embed.actions",
      placement: "top-bar-end",
      component: EmbedActions,
    },
  ],
});
