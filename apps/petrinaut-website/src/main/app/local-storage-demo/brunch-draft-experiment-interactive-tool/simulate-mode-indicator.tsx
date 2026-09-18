import { useSyncExternalStore, type MouseEvent } from "react";

import { Tooltip } from "@hashintel/ds-components";
import { css } from "@hashintel/ds-helpers/css";
import { usePetrinautInstance } from "@hashintel/petrinaut/react";

import { sessionDraftsFor } from "./session-drafts";

const indicatorLabel = "1 draft experiment";

const badgeStyle = css({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "[16px]",
  height: "[16px]",
  marginLeft: "1",
  paddingX: "[4px]",
  borderRadius: "full",
  backgroundColor: "blue.s90",
  color: "white",
  fontSize: "[9px]",
  lineHeight: "[16px]",
  flexShrink: 0,
  _focusVisible: {
    outline: "2px solid",
    outlineColor: "blue.a30",
    outlineOffset: "[1px]",
  },
});

const activateContainingMode = (event: MouseEvent<HTMLSpanElement>) => {
  event.preventDefault();
  event.currentTarget
    .closest("label")
    ?.querySelector<HTMLInputElement>('input[type="radio"]')
    ?.click();
};

export const BrunchDraftExperimentIndicator = () => {
  const instance = usePetrinautInstance();
  const sessionDrafts = sessionDraftsFor(instance.definition);
  const hasCurrentDraft = useSyncExternalStore(sessionDrafts.subscribe, () => {
    const state = sessionDrafts.get();
    const draft =
      state.currentToolCallId === null
        ? undefined
        : state.drafts.get(state.currentToolCallId);

    return (
      draft !== undefined &&
      draft.prepared !== null &&
      draft.invalid === null &&
      !draft.dismissed &&
      draft.run.phase === "idle"
    );
  });

  if (!hasCurrentDraft) {
    return null;
  }

  return (
    <Tooltip content={indicatorLabel} closeOnClick={false} openDelay="none">
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Pointer activation is forwarded to the containing Simulate radio; this is intentionally not a second keyboard control. */}
      <span
        className={badgeStyle}
        data-draft-experiment-indicator=""
        onClick={activateContainingMode}
      >
        1
      </span>
    </Tooltip>
  );
};
