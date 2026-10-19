import type { LedgerComment } from "../comments";
import type { Obligation } from "../construction/obligations";
import type { Reflection } from "../construction/reflections";
import type { Claim } from "../elicitation/claims";
import type { Entity } from "../elicitation/entities";

/** A conversation turn anchor: the preceding user message's ID and excerpt. */
export interface Turn {
  id: string;
  excerpt: string;
}

/** What the system adds to a committed payload: its address and turn anchor. */
interface RecordAnchor {
  address: string;
  turn: string;
}

/** A payload's `resolves` lands on the comments it names, not on the record. */
export type EntityRecord = Omit<Entity, "resolves"> & RecordAnchor;

/** References resolve from `$n`/ID references to the addresses they name. */
export type ClaimRecord = Omit<Claim, "entities" | "supersedes" | "resolves"> &
  RecordAnchor & {
    entities: string[];
    supersedes?: string[];
  };

export type ReflectionRecord = Omit<
  Reflection,
  "claims" | "entities" | "discharges" | "resolves"
> &
  RecordAnchor & {
    claims?: string[];
    entities?: string[];
    discharges?: string[];
  };

export type ObligationRecord = Omit<
  Obligation,
  "claims" | "entities" | "resolves"
> &
  RecordAnchor & {
    claims?: string[];
    entities?: string[];
  };

/** A user's comment on Ledger records, anchored to the turn its signal opened. */
export type CommentRecord = LedgerComment & {
  turn: string;
  /** The first record whose entry resolved it; absent while it is open. */
  resolvedBy?: string;
};

/**
 * Committed Ledger records as the system holds them after commits: payloads
 * plus the system-assigned address and turn anchor the model never submits,
 * and the comments the user sent on them.
 */
export interface LedgerState {
  title: string;
  turns: Turn[];
  entities: EntityRecord[];
  claims: ClaimRecord[];
  reflections: ReflectionRecord[];
  obligations: ObligationRecord[];
  comments: CommentRecord[];
}
