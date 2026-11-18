import { Box, styled } from "@mui/material";
import { use } from "react";

import { Button, Icon, TextInput } from "@hashintel/ds-components";

import { ChartNetworkRegularIcon } from "../../../../../../../shared/icons/chart-network-regular-icon";
import { TopBarContext } from "../../top-bar-context";
import { VersionPicker } from "./version-picker";

/**
 * The grays HASH's breadcrumbs use elsewhere in the app: crumb text (and
 * the crumb's icon / the process title) in the darker grey-blue, the
 * chevron separators lighter. Neither the MUI theme (closest:
 * `palette.gray[70]` #64778C / `palette.gray[50]` #91A5BA) nor the
 * ds-components palette has exact tokens for these, so they're pinned here.
 */
const BREADCRUMB_TEXT_COLOR = "#677789";
const BREADCRUMB_CHEVRON_COLOR = "#95a5b8";

const TitleInput = styled(TextInput)({
  color: BREADCRUMB_TEXT_COLOR,
  fontWeight: 500,
  margin: "0 8px",
});

/**
 * HASH-style breadcrumbs at the start of Petrinaut's top bar, so the editor
 * shows a single bar. The editable process title is the final crumb, tinted
 * to match, and renames in place through the page's title state. Crumbs and
 * title are siblings in the bar, so the title takes the remaining width.
 */
export const TopBarBreadcrumbs = () => {
  const topBar = use(TopBarContext);
  if (!topBar) {
    return null;
  }

  return (
    <>
      <Box
        sx={{
          alignItems: "center",
          /** Inherited by the chevron separator's `currentColor` fill. */
          color: BREADCRUMB_CHEVRON_COLOR,
          display: "flex",
          gap: 0.5,
        }}
      >
        <Button
          size="sm"
          variant="ghost"
          onClick={topBar.onNavigateBack}
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
      </Box>
      <TitleInput
        variant="subtle"
        size="sm"
        value={topBar.title}
        onChange={topBar.onTitleChange}
        placeholder="Process"
        readonly={topBar.readonly}
      />
    </>
  );
};

/** Version picker and Save/Create at the end of the top bar, for an editable net. */
export const TopBarActions = () => {
  const topBar = use(TopBarContext);
  if (!topBar || topBar.readonly) {
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
    saveRefusal,
  } = topBar;

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
        disabled={saveRefusal !== null}
        loading={persistPending}
        tooltip={saveRefusal === "clean" ? "No changes to save" : undefined}
      >
        {saveLabel}
      </Button>
    </>
  );
};
