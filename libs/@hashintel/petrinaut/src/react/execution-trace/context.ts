import { createContext } from "react";

import type {
  ExecutionTrace,
  PlayableTrace,
  RunClock,
  RunContinuity,
} from "@hashintel/petrinaut-core";

/**
 * The execution the editor shows, whatever produced it. The canvas, the
 * timeline and the playback controls read this, so they show a run a
 * simulation computes and an execution the host reports with the same code.
 */
export type ViewedExecution = {
  /**
   * What produces the execution: a simulation the editor computes, or the
   * host. Play starts and paces the first; the second happens on its own,
   * and Play only moves the view of it.
   */
  origin: "simulation" | "host";
  /**
   * The execution's events and its state at any position. Null without
   * one, and for a Stochastic simulation, whose samples are no events.
   */
  trace: ExecutionTrace | null;
  /** What playback moves over: the trace, or a Stochastic simulation's samples. */
  playable: PlayableTrace | null;
  /** What a position counts. The trace's clock, and the net's before a run exists. */
  clock: RunClock;
  /** What lies between two events. The trace's, and the net's before a run exists. */
  continuity: RunContinuity;
};

/** The value outside an `ExecutionTraceProvider`: nothing to view. */
export const NO_VIEWED_EXECUTION: ViewedExecution = {
  origin: "simulation",
  trace: null,
  playable: null,
  clock: "time",
  continuity: "continuous",
};

export const ExecutionTraceContext =
  createContext<ViewedExecution>(NO_VIEWED_EXECUTION);
