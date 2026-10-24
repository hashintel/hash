import type { NetElementAddress } from "./construction/reflections";
import type {
  ClaimRecord,
  EntityRecord,
  LedgerState,
  ObligationRecord,
  ReflectionRecord,
  Turn,
} from "./projection/records";

/** Where a trace starts: net elements reflections name, Ledger records, or both. */
export interface LedgerTraceSeeds {
  /**
   * Whether a net element address a reflection names is one sought. A
   * predicate, so the caller decides how written IDs match the document's.
   */
  readonly netElement?: (address: NetElementAddress) => boolean;
  /** Record addresses to start from, such as `c4` or `e2`. */
  readonly records?: readonly string[];
}

/** The records behind the seeds, each list in Ledger order, and the turns they came from. */
export interface LedgerTrace {
  readonly reflections: readonly ReflectionRecord[];
  readonly obligations: readonly ObligationRecord[];
  readonly claims: readonly ClaimRecord[];
  readonly entities: readonly EntityRecord[];
  /** Each traced claim a later claim replaced, with the address of the claim that stands now. */
  readonly superseded: Readonly<Record<string, string>>;
  /** The turns the traced records were recorded in, in conversation order. */
  readonly turns: readonly Turn[];
  /** Seed addresses the Ledger does not hold. */
  readonly missing: readonly string[];
}

/**
 * Walk back from the seeds to the records they rest on: a net element to the
 * reflections that name it; a reflection to its claims, entities and the
 * obligations it discharges; an obligation to its claims and entities; a claim
 * to its entities. Every record reached contributes its turn. The walk never
 * runs forward, so an entity does not pull in every claim about it.
 */
export const traceLedger = (
  state: LedgerState,
  seeds: LedgerTraceSeeds,
): LedgerTrace => {
  const reached = new Set<string>();
  const pending: string[] = [];
  const reach = (addresses: readonly string[] | undefined) => {
    for (const address of addresses ?? [])
      if (!reached.has(address)) {
        reached.add(address);
        pending.push(address);
      }
  };

  const reflections = new Map(
    state.reflections.map((record) => [record.address, record]),
  );
  const obligations = new Map(
    state.obligations.map((record) => [record.address, record]),
  );
  const claims = new Map(
    state.claims.map((record) => [record.address, record]),
  );
  const entities = new Map(
    state.entities.map((record) => [record.address, record]),
  );
  const holds = (address: string) =>
    reflections.has(address) ||
    obligations.has(address) ||
    claims.has(address) ||
    entities.has(address);

  const { netElement } = seeds;
  if (netElement)
    reach(
      state.reflections
        .filter((record) => record.netElements?.some(netElement))
        .map(({ address }) => address),
    );
  reach(seeds.records);

  for (
    let address = pending.shift();
    address !== undefined;
    address = pending.shift()
  ) {
    const reflection = reflections.get(address);
    if (reflection) {
      reach(reflection.discharges);
      reach(reflection.claims);
      reach(reflection.entities);
    }
    const obligation = obligations.get(address);
    if (obligation) {
      reach(obligation.claims);
      reach(obligation.entities);
    }
    reach(claims.get(address)?.entities);
  }

  const inOrder = <LedgerRecord extends { address: string }>(
    records: readonly LedgerRecord[],
  ) => records.filter(({ address }) => reached.has(address));
  const traced = {
    reflections: inOrder(state.reflections),
    obligations: inOrder(state.obligations),
    claims: inOrder(state.claims),
    entities: inOrder(state.entities),
  };

  const replacedBy = new Map<string, string>();
  for (const claim of state.claims)
    for (const earlier of claim.supersedes ?? [])
      replacedBy.set(earlier, claim.address);
  // A claim only supersedes earlier claims, so the chain ends.
  const standing = (address: string): string => {
    const next = replacedBy.get(address);
    return next === undefined ? address : standing(next);
  };
  const superseded: Record<string, string> = {};
  for (const { address } of traced.claims)
    if (replacedBy.has(address)) superseded[address] = standing(address);

  const turnIds = new Set(
    [
      ...traced.reflections,
      ...traced.obligations,
      ...traced.claims,
      ...traced.entities,
    ].map(({ turn }) => turn),
  );

  return {
    ...traced,
    superseded,
    turns: state.turns.filter(({ id }) => turnIds.has(id)),
    missing: (seeds.records ?? []).filter((address) => !holds(address)),
  };
};
