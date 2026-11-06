/**
 * A run's name. Runs are entities, so each has a UUID; people name a run by a short slice of it ("run A4 vs B7"),
 * not by a counting number, which has no clear scope across webs (6 Nov sync, A21 and A22).
 *
 * `?runid=` picks the slice. Unset keeps "Run 17".
 * - a: the last 2 characters, capitals, the UI font ("A4").
 * - b: the last 4, capitals, the UI font ("3FA4").
 * - c: the last 4, lowercase, monospace ("3fa4").
 * - d: the last 6, lowercase, monospace ("c03fa4").
 *
 * The top bar and the Logs table both read these, so a run has one name everywhere.
 */
import { createElement } from "react";

import { css } from "@hashintel/ds-helpers/css";

import type { RunRecord } from "./run-history";

export type RunIdTake = "a" | "b" | "c" | "d";

export const runIdTake = (): RunIdTake | null => {
  const value = new URLSearchParams(globalThis.location.search).get("runid");
  return value === "a" || value === "b" || value === "c" || value === "d"
    ? value
    : null;
};

/** A stable, made-up UUID per run, so the same run keeps the same ID on every load. */
export const runUuid = (run: Pick<RunRecord, "id"> & { uuid?: string }) => {
  if (run.uuid) {
    return run.uuid;
  }
  let seed = (run.id * 2654435761) >>> 0;
  const next = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(seed ^ (seed >>> 15), seed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) % 16;
  };
  const hex = Array.from({ length: 32 }, () => next().toString(16));
  hex[12] = "4";
  return `${hex.slice(0, 8).join("")}-${hex.slice(8, 12).join("")}-${hex.slice(12, 16).join("")}-${hex.slice(16, 20).join("")}-${hex.slice(20).join("")}`;
};

const sliceLength: Record<RunIdTake, number> = { a: 2, b: 4, c: 4, d: 6 };

/** The short ID: "A4" (a), "3FA4" (b), "3fa4" (c), "c03fa4" (d); the counting number when no take is set. */
export const runId = (run: Pick<RunRecord, "id">, take = runIdTake()) => {
  if (!take) {
    return String(run.id);
  }
  const tail = runUuid(run).replaceAll("-", "").slice(-sliceLength[take]);
  return take === "a" || take === "b" ? tail.toUpperCase() : tail;
};

/** "Run A4"; "Run 17" when no take is set. */
export const runLabel = (run: Pick<RunRecord, "id">, take = runIdTake()) =>
  `Run ${runId(run, take)}`;

export const runIdMono = (take = runIdTake()) => take === "c" || take === "d";

const monoStyle = css({
  fontFamily: "mono",
  fontSize: "[0.92em]",
  letterSpacing: "[0]",
});

/** The short ID as text, in monospace for takes c and d. */
export const RunIdText = ({
  run,
  take = runIdTake(),
  prefix = false,
}: {
  run: Pick<RunRecord, "id">;
  take?: RunIdTake | null;
  /** "Run A4" instead of "A4". */
  prefix?: boolean;
}) =>
  createElement(
    "span",
    null,
    prefix ? "Run " : null,
    runIdMono(take)
      ? createElement("span", { className: monoStyle }, runId(run, take))
      : runId(run, take),
  );
