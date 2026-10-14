/**
 * Backpressure from the atlas rate limiter.
 *
 * Two signals feed one gate. The reactive one: the atlas answers an
 * over-budget caller with `429` and a `Retry-After` naming when the budget
 * readmits it. The proactive one: every enforced response reports each budget
 * the request was checked against as draft-ietf-httpapi-ratelimit-headers-11
 * items — `RateLimit-Policy: "gate";q=50;w=5` stating the burst `q` and the
 * whole seconds `w` an exhausted budget takes to refill, and
 * `RateLimit: "gate";r=46` stating the requests `r` it has left — so the
 * client can see a budget running dry before the first refusal.
 *
 * Required viewport loads already retry with backoff (see `withAtlasRetry` in
 * `fetch-tile.ts`); what must *not* continue is speculation — a prefetch
 * spends exactly the budget the required loads need. So every `429` any data
 * route sees lands here (see `requestAtlasOnce`), every response's budget
 * report lands here too, and the prefetch scheduler asks before speculating
 * (see `getViewportNodes`).
 *
 * The two signals keep separate deadlines because they age differently. A
 * refusal's deadline only extends — a shorter wait landing during a longer
 * pause must not cut it. A budget report is a snapshot, and a fresher one is
 * simply truer — required traffic pausing lets the budget refill, and the
 * next response says so — so its deadline is overwritten, not merged. The
 * gate reads the later of the two.
 *
 * The budget reports also drive dispatch pacing, which is what keeps
 * *required* traffic out of the refusal path: each reported budget gets a
 * client-side token mirror ({@link AtlasBudgetModel}), spent at dispatch and
 * refilled at the policy's rate, and the request pool asks
 * {@link takeAtlasRequestToken} before sending — a request the server would
 * refuse waits in the client's queue instead of burning a round trip on a
 * `429` and a retry (see `atlas-request-pool.ts`).
 *
 * Every signal degrades to nothing absent its headers: no `RateLimit` items
 * means no reserve deadline, no pacing models, and the `429` path alone paces
 * the client; an unexposed `Retry-After` still pauses for the floor. Budgets
 * are also per-server-instance (N replicas admit up to N× the reported
 * rates), so a report is treated as a pacing hint, never a guarantee.
 */

/** Pause on a `429` carrying no readable `Retry-After`, and the floor under one that does. */
const SPECULATION_PAUSE_MIN_MS = 2_000;
/**
 * Ceiling on a single pause. A drained hourly budget can name minutes; honouring
 * it in full is correct, but an unreadable clock or a garbage header must not
 * freeze speculation for a session, so the deadline is bounded.
 */
const SPECULATION_PAUSE_MAX_MS = 5 * 60_000;

/**
 * Requests a budget must have left before speculation runs: one full prefetch
 * batch (`PREFETCH_MAX`, 16) plus a typical pan step's required frontier, so
 * speculating never eats the headroom the next required loads land in.
 */
const SPECULATION_RESERVE_REQUESTS = 24;

/**
 * Floor under one pacing wait, so near-ready dispatches don't spin the clock.
 */
const PACE_WAIT_MIN_MS = 25;
/**
 * Ceiling on one pacing wait; the pool re-asks when it elapses, so a long
 * drought is many bounded sleeps rather than one unbounded one.
 */
const PACE_WAIT_MAX_MS = 30_000;
/**
 * A budget the server has not re-reported for this long stops pacing anyone:
 * the policy may have been lifted, and the `429` path still covers the case
 * where it was not.
 */
const MODEL_TTL_MS = 5 * 60_000;

/** The `429` deadline: only ever extends (see the module doc). */
let rateLimitedUntil = 0;
/** The latest budget report's deadline: overwritten by each fresher report. */
let budgetReserveUntil = 0;

interface AtlasBudgetModel {
  /** Locally projected requests left, as of {@link AtlasBudgetModel.projectedAt}. */
  tokens: number;
  /** The burst size `q`; projection never refills past it. */
  capacity: number;
  /** Refill rate, `q / (w * 1000)` tokens per millisecond. */
  ratePerMs: number;
  /** When {@link AtlasBudgetModel.tokens} was last materialised. */
  projectedAt: number;
  /** When the server last reported this budget; stale models stop pacing. */
  reportedAt: number;
}

/** Pacing models keyed by the budget name the server reports. */
const budgetModels = new Map<string, AtlasBudgetModel>();

/** `model.tokens` brought forward to `now` at the policy's refill rate. */
const projectedTokens = (model: AtlasBudgetModel, now: number): number =>
  Math.min(
    model.capacity,
    model.tokens + (now - model.projectedAt) * model.ratePerMs,
  );

export interface AtlasBudgetReport {
  readonly name: string;
  /** Requests left (`RateLimit`'s `r`). */
  readonly remaining: number | undefined;
  /** Burst size (`RateLimit-Policy`'s `q`). */
  readonly quota: number | undefined;
  /** Whole seconds an exhausted budget takes to refill (`RateLimit-Policy`'s `w`). */
  readonly windowSeconds: number | undefined;
}

/**
 * The named items of a `RateLimit`/`RateLimit-Policy` field value, tolerantly:
 * items split on `,`, a `"quoted"` name, `;`-separated `key=value` parameters.
 * Malformed items are skipped rather than failing the field
 */
const parseItems = (
  header: string | null,
): { name: string; params: Map<string, number> }[] => {
  if (header === null) {
    return [];
  }
  const items: { name: string; params: Map<string, number> }[] = [];
  for (const segment of header.split(",")) {
    const [head, ...rest] = segment.trim().split(";");
    const name = /^"([^"]*)"$/.exec(head?.trim() ?? "")?.[1];
    if (name === undefined || name === "") {
      continue;
    }
    const params = new Map<string, number>();
    for (const parameter of rest) {
      const [key, raw] = parameter.trim().split("=");
      const value = Number(raw);
      if (
        key !== undefined &&
        key !== "" &&
        Number.isFinite(value) &&
        value >= 0
      ) {
        params.set(key, value);
      }
    }
    items.push({ name, params });
  }
  return items;
};

/**
 * Joins one response's `RateLimit-Policy` and `RateLimit` field values into
 * per-budget reports, matched by the item name both fields carry.
 */
export const parseAtlasBudgets = (
  policyHeader: string | null,
  limitHeader: string | null,
): AtlasBudgetReport[] => {
  const policies = new Map(
    parseItems(policyHeader).map((item) => [item.name, item.params]),
  );
  return parseItems(limitHeader).map(({ name, params }) => ({
    name,
    remaining: params.get("r"),
    quota: policies.get(name)?.get("q"),
    windowSeconds: policies.get(name)?.get("w"),
  }));
};

/**
 * Records a response's budget report, pausing speculation while any budget
 * sits below the reserve.
 *
 * The pause is the time the thinnest budget needs to refill back to the
 * reserve at its policy's rate — `(reserve - r) * w / q` seconds — so it ends
 * exactly when speculating stops costing required headroom. A budget below
 * the reserve whose policy item is missing or unreadable pauses for the floor
 * instead. The deadline replaces the previous report's: a fresher snapshot is
 * truer, in both directions.
 */
export const noteAtlasBudget = (
  policyHeader: string | null,
  limitHeader: string | null,
): void => {
  const now = Date.now();
  let waitMs = 0;
  let reported = false;
  for (const budget of parseAtlasBudgets(policyHeader, limitHeader)) {
    if (budget.remaining === undefined) {
      continue;
    }
    reported = true;

    // Sync the pacing model where the policy's rate is known. Downward only:
    // requests this side dispatched after the server processed this one are
    // already spent locally and absent from its count.
    if (
      budget.quota !== undefined &&
      budget.quota > 0 &&
      budget.windowSeconds !== undefined
    ) {
      const capacity = budget.quota;
      const ratePerMs = capacity / (budget.windowSeconds * 1000);
      const model = budgetModels.get(budget.name);
      budgetModels.set(budget.name, {
        tokens:
          model === undefined
            ? budget.remaining
            : Math.min(projectedTokens(model, now), budget.remaining),
        capacity,
        ratePerMs,
        projectedAt: now,
        reportedAt: now,
      });
    }

    const deficit = SPECULATION_RESERVE_REQUESTS - budget.remaining;
    if (deficit <= 0) {
      continue;
    }
    const refillMs =
      budget.quota !== undefined &&
      budget.quota > 0 &&
      budget.windowSeconds !== undefined
        ? deficit * ((budget.windowSeconds * 1000) / budget.quota)
        : SPECULATION_PAUSE_MIN_MS;
    waitMs = Math.max(waitMs, Math.min(refillMs, SPECULATION_PAUSE_MAX_MS));
  }
  // A response with no readable budget items says nothing about recovery, so
  // it must not clear a standing pause; only a real report overwrites.
  if (reported) {
    budgetReserveUntil = waitMs === 0 ? 0 : now + waitMs;
  }
};

/**
 * Takes one request's worth of budget for dispatch, or names the wait.
 *
 * Returns `0` after spending one token from every live pacing model — the
 * request may go to the wire — or the milliseconds to wait before asking
 * again, bounded to `[25ms, 30s]` per ask. A `speculative` request spends
 * only when every budget would still hold the reserve afterwards, so
 * speculation never paces its way into the headroom required loads need.
 *
 * With no live models — no budget reported yet, reports without a readable
 * policy, or every model past its TTL — dispatch is free: pacing degrades to
 * the `429` path rather than inventing a rate.
 */
export const takeAtlasRequestToken = (
  lane: "required" | "speculative",
): number => {
  const now = Date.now();
  const need = lane === "speculative" ? SPECULATION_RESERVE_REQUESTS + 1 : 1;
  let waitMs = 0;
  for (const [name, model] of budgetModels) {
    if (now - model.reportedAt > MODEL_TTL_MS) {
      budgetModels.delete(name);
      continue;
    }
    const tokens = projectedTokens(model, now);
    if (tokens < need) {
      waitMs = Math.max(waitMs, (need - tokens) / model.ratePerMs);
    }
  }
  if (waitMs > 0) {
    return Math.min(
      Math.max(Math.ceil(waitMs), PACE_WAIT_MIN_MS),
      PACE_WAIT_MAX_MS,
    );
  }
  for (const model of budgetModels.values()) {
    model.tokens = projectedTokens(model, now) - 1;
    model.projectedAt = now;
  }
  return 0;
};

/**
 * Returns one spent token to every live pacing model.
 *
 * For a request that took its token and then never reached the server the sync in
 * {@link noteAtlasBudget} only moves the estimate *down* (an in-flight spend
 * is absent from an older report's count): a phantom spend would throttle later requests for
 * budget the server never saw and no report could ever restore, while an
 * over-generous refund — the model replaced between spend and refund, say —
 * is pulled back by the very next report. Capped at the burst, like refill.
 */
export const refundAtlasRequestToken = (): void => {
  const now = Date.now();
  for (const model of budgetModels.values()) {
    model.tokens = Math.min(model.capacity, projectedTokens(model, now) + 1);
    model.projectedAt = now;
  }
};

/**
 * Records a rate-limited response. `retryAfterMs` is the server's stated wait
 * when the response carried a readable `Retry-After`; the pause is that wait
 * clamped to `[2s, 5min]`. Deadlines only extend — a shorter wait landing
 * during a longer pause does not cut it.
 */
export const noteAtlasRateLimited = (retryAfterMs?: number): void => {
  const pause = Math.min(
    Math.max(retryAfterMs ?? 0, SPECULATION_PAUSE_MIN_MS),
    SPECULATION_PAUSE_MAX_MS,
  );
  rateLimitedUntil = Math.max(rateLimitedUntil, Date.now() + pause);
};

/** Whether speculative prefetching should currently yield to required loads. */
export const isAtlasSpeculationPaused = (): boolean => {
  const now = Date.now();
  return now < rateLimitedUntil || now < budgetReserveUntil;
};

/** Clears both deadlines and every pacing model; for tests. */
export const resetAtlasBackpressure = (): void => {
  rateLimitedUntil = 0;
  budgetReserveUntil = 0;
  budgetModels.clear();
};
