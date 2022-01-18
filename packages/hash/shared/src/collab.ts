/**
 * Represents user position within a page, sent to collab clients
 */
export interface CollabPosition {
  userId: string;
  userShortname: string;
  userPreferredName: string;
  entityId: string;
}
