/**
 * Represents user position within a page, sent to collab clients
 */
export interface CollabPosition {
  userId: string;
  userShortname: string;
  userDisplayName: string;
  entityId: string;
}
