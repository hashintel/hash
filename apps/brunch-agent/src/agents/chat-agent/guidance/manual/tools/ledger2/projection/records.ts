import type { NetElementAddress } from "../construction/reflections.ts";
import type { EntityKind } from "../elicitation/entities.ts";
import type { Origin, Status } from "../shared/epistemics.ts";

/** A conversation turn anchor: the preceding user message's ID and excerpt. */
export interface Turn {
  id: string;
  excerpt: string;
}

export interface EntityRecord {
  address: string;
  name: string;
  kind: EntityKind;
  origin: Origin;
  status: Status;
  turn: string;
}

export interface ClaimRecord {
  address: string;
  text: string;
  entities: string[];
  origin: Origin;
  status: Status;
  supersedes?: string[];
  turn: string;
}

export interface ReflectionRecord {
  address: string;
  text: string;
  netElements?: NetElementAddress[];
  claims?: string[];
  entities?: string[];
  turn: string;
}

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
}
