/**
 * The `version_load` prompt section: which saved version the user last
 * loaded, and so which version saves build on.
 *
 * Admission records each new load in `VersionLoadsDoc`, keyed by the
 * submission that carried it. The section renders the newest load whose
 * submission is at or below the newest input of the running run. Pi commits a follow-up's load at admission, while the
 * earlier run is still preparing requests; the bound keeps that load out of
 * the earlier run, so it first shows in the run its input starts.
 *
 * Pi appends a section's text as a positional system delta only when it
 * changes, and restates every section in the baseline it writes after a
 * compaction head, so the load shows once where it happened and survives
 * compaction. The document is rewindable and forks `asOf`: a fork made before
 * a load renders none.
 */
import {
  defineExtension,
  type Extension,
  LiveDoc,
  type PromptInput,
  section,
} from "@earendil-works/pi-durable";

import { versionLoadSectionText } from "@hashintel/brunch-agent";

import {
  type RecordedVersionLoad,
  VersionLoadsDoc,
} from "../../shared/version-loads-doc";

import type { Context } from "@earendil-works/chord/context";

export const versionLoadSectionKey = "version_load";

/** The newest load admitted with one of the running run's inputs, or before them. */
const loadInContext = async (
  input: PromptInput,
  context: Context,
): Promise<RecordedVersionLoad | undefined> => {
  const [document, live] = await Promise.all([
    input.read.snapshot(VersionLoadsDoc, input.conversationId, context),
    input.read.snapshot(LiveDoc, input.conversationId, context),
  ]);
  const inputs = live?.run?.inputs ?? [];
  // With no placed input to bound it, every recorded load counts.
  const newestInput = inputs.length === 0 ? undefined : Math.max(...inputs);
  return document?.loads.findLast(
    ({ submission }) => newestInput === undefined || submission <= newestInput,
  );
};

export const versionLoadSection = section(
  versionLoadSectionKey,
  async (input, context) => {
    const load = await loadInContext(input, context);
    return load === undefined ? undefined : versionLoadSectionText(load);
  },
);

export const versionLoadSectionExtension: Extension = defineExtension({
  name: "brunch.version-load-section",
  sections: [versionLoadSection],
});
