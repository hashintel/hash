import type { EntityId, Timestamp } from "@blockprotocol/type-system";
import type { Subtype } from "@local/advanced-types/subtype";
import type { DiffEntityParams } from "@local/hash-graph-client";

export type DiffEntityInput = Subtype<
  DiffEntityParams,
  {
    firstEntityId: EntityId;
    firstTransactionTime: Timestamp | null;
    firstDecisionTime: Timestamp | null;
    secondEntityId: EntityId;
    secondDecisionTime: Timestamp | null;
    secondTransactionTime: Timestamp | null;
  }
>;
