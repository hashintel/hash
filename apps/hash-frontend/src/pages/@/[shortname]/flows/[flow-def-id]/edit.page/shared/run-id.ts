import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { css } from "@hashintel/ds-helpers/css";

import type { EntityId } from "@blockprotocol/type-system";

/** How many of the last characters of a run's entity uuid name the run. */
export const runIdLength = 6;

/** The run's short ID, e.g. "7A6A11": runs have no number of their own that holds across webs. */
export const getShortRunId = (flowRunEntityId: EntityId) =>
  extractEntityUuidFromEntityId(flowRunEntityId)
    .slice(-runIdLength)
    .toUpperCase();

/** How a short run ID is set wherever it shows: in the Logs table and the top bar's breadcrumb. */
export const shortRunIdFont = css({
  /* The `mono` token starts with Geist Mono's variable, which the frontend doesn't define, so it falls back to Inter. */
  fontFamily: "[ui-monospace, SFMono-Regular, monospace]",
  fontSize: "[13px]",
});
