import type {
  CollabPosition,
  DocumentChange,
} from "@hashintel/hash-shared/collab";

export { CollabPosition };

/**
 * A Subscription manages the life-time of a subscription to *something*
 * It is uniquely identified by an identifier
 */
export type Subscription<T> = {
  identifier: string;
  persistent: boolean;
  notify: (update: T) => void;
  error?: (error: string) => void;
};

/** Document Change Subscription */
export type DocumentChangeSubscription = Subscription<DocumentChange>;

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
export type CollabPositionSubscription = Subscription<CollabPosition[]> & {
  /** Helps avoid redundant roundtrips by skipping  */
  baselinePositions: CollabPosition[];
  /** Prevents updates from changes in own position */
  userIdToExclude: string;
};
