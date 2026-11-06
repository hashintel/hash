import { foldCommits, historyBeforeLatestTurn } from "./commits";
import { owedObligations } from "./projection/project-ledger";

import type { LedgerHistory } from "./commits";
import type {
  ClaimRecord,
  EntityRecord,
  LedgerState,
} from "./projection/records";

/** How an entry stands after the latest turn: added in it, or changed by it. */
export type LedgerChange = "added" | "updated";

const sameEntity = (before: EntityRecord, after: EntityRecord) =>
  before.name === after.name &&
  before.kind === after.kind &&
  before.origin === after.origin &&
  before.status === after.status;

/**
 * The entries the latest turn added or changed, by address: its net effect
 * on the Ledger as it stood when the turn opened, so an update the turn
 * undid is no change. A current claim that replaces one from before the turn
 * is updated; the claims it replaced are history, not changes. An obligation
 * the turn met is updated. Only accepted commits count, as for the fold.
 * `after` is the fold of the whole history, when the caller already has it.
 */
export const latestTurnChanges = (
  history: LedgerHistory,
  after: LedgerState = foldCommits(history).state,
): ReadonlyMap<string, LedgerChange> => {
  const changes = new Map<string, LedgerChange>();
  const earlier = historyBeforeLatestTurn(history);
  if (earlier === undefined) return changes;
  const before = foldCommits(earlier).state;

  const entitiesBefore = new Map(
    before.entities.map((entity) => [entity.address, entity]),
  );
  for (const entity of after.entities) {
    const prior = entitiesBefore.get(entity.address);
    if (prior === undefined) changes.set(entity.address, "added");
    else if (!sameEntity(prior, entity)) changes.set(entity.address, "updated");
  }

  const claimsBefore = new Set(before.claims.map(({ address }) => address));
  const claims = new Map(after.claims.map((claim) => [claim.address, claim]));
  const superseded = new Set(
    after.claims.flatMap((claim) => claim.supersedes ?? []),
  );
  const replacesEarlier = (claim: ClaimRecord): boolean =>
    (claim.supersedes ?? []).some((address) => {
      if (claimsBefore.has(address)) return true;
      const replaced = claims.get(address);
      return replaced !== undefined && replacesEarlier(replaced);
    });
  for (const claim of after.claims)
    if (!claimsBefore.has(claim.address) && !superseded.has(claim.address))
      changes.set(claim.address, replacesEarlier(claim) ? "updated" : "added");

  const reflectionsBefore = new Set(
    before.reflections.map(({ address }) => address),
  );
  for (const { address } of after.reflections)
    if (!reflectionsBefore.has(address)) changes.set(address, "added");

  const obligationsBefore = new Set(
    before.obligations.map(({ address }) => address),
  );
  const owedBefore = new Set(
    owedObligations(before).map(({ address }) => address),
  );
  const owedAfter = new Set(
    owedObligations(after).map(({ address }) => address),
  );
  for (const { address } of after.obligations)
    if (!obligationsBefore.has(address)) changes.set(address, "added");
    else if (owedBefore.has(address) && !owedAfter.has(address))
      changes.set(address, "updated");

  return changes;
};
