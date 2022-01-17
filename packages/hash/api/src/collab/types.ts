import { Response } from "express";
import type { CollabPosition } from "@hashintel/hash-shared/collab";

export { CollabPosition };

/**
 * Internal type to enable garbage collection for positions
 */
export interface TimedCollabPosition extends CollabPosition {
  /** UNIX timestamp in milliseconds */
  reportedAt: number;
}

/**
 * Used inside collab instances to track long polling requests for position changes
 */
export interface CollabPositionPoller {
  /** Helps avoid redundant roundtrips by skipping  */
  baselinePositions: CollabPosition[];
  /** Prevents updates from changes in own position */
  userIdToExclude: string;
  response: Response;
}
