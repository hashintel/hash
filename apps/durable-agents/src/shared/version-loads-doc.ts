/**
 * The document of a conversation's version loads: `POST /chat` admission
 * records each new load in it, and the `version_load` prompt section renders
 * from it. Rewindable and forked `asOf`, so a fork made before a load holds
 * none.
 */
import { defineDoc, type SubmissionId } from "@earendil-works/pi-durable";

import type { VersionLoad } from "@hashintel/brunch-agent";

/** A load the user made, recorded with the submission whose input carried it. */
export type RecordedVersionLoad = {
  readonly id: VersionLoad["id"];
  readonly decisionTime: VersionLoad["decisionTime"];
  readonly submission: SubmissionId;
};

/** Each new load, in admission order, so in ascending submission order. */
export const VersionLoadsDoc = defineDoc<{ loads: RecordedVersionLoad[] }>({
  kind: "brunch.version-loads",
  version: 1,
  scope: "conversation",
  history: "rewindable",
  fork: "asOf",
  initial: () => ({ loads: [] }),
  checkpointWhen: () => false,
});
