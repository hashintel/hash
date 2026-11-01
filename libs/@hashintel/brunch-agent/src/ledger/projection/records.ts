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

export type EntityRecord = Entity & RecordAnchor;

/** References resolve from `$n`/ID references to the addresses they name. */
export type ClaimRecord = Omit<Claim, "entities" | "supersedes"> &
  RecordAnchor & {
    entities: string[];
    supersedes?: string[];
  };

export type ReflectionRecord = Omit<
  Reflection,
  "claims" | "entities" | "discharges"
> &
  RecordAnchor & {
    claims?: string[];
    entities?: string[];
    discharges?: string[];
  };

export type ObligationRecord = Omit<Obligation, "claims" | "entities"> &
  RecordAnchor & {
    claims?: string[];
    entities?: string[];
  };

/**
 * Committed Ledger records as the system holds them after commits: payloads
 * plus the system-assigned address and turn anchor the model never submits.
 */
export interface LedgerState {
  title: string;
  turns: Turn[];
  entities: EntityRecord[];
  claims: ClaimRecord[];
  reflections: ReflectionRecord[];
  obligations: ObligationRecord[];
}
