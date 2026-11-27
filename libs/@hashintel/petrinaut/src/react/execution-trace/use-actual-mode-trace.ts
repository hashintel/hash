import { use, useEffect, useState } from "react";

import {
  createActualModeTrace,
  getActualModeEpochMs,
  type ActualModeTrace,
  type ActualModeTransitionFiring,
  type ExecutionTrace,
  type SDCPN,
} from "@hashintel/petrinaut-core";

import { SDCPNContext } from "../document/sdcpn-context";
import { ActualModeContext } from "../host/actual-mode-context";

/** One execution of the host, as the trace it was mapped to. */
type Mapping = {
  sourceId: string;
  definition: SDCPN;
  epochMs: number | null;
  /** The host's list as last rendered: the trace holds these firings, or is about to. */
  firings: readonly ActualModeTransitionFiring[];
  actual: ActualModeTrace;
};

/**
 * Whether `next` is `previous` with firings added at its end, which is how
 * a host's list grows. The last firing both hold is compared by what it
 * says, since a host may rebuild its list on every update.
 */
const extendsFirings = (
  previous: readonly ActualModeTransitionFiring[],
  next: readonly ActualModeTransitionFiring[],
): boolean => {
  if (next.length < previous.length) {
    return false;
  }
  const last = previous.at(-1);
  const same = next[previous.length - 1];
  return (
    last === undefined ||
    (same !== undefined &&
      same.transitionId === last.transitionId &&
      same.ts === last.ts)
  );
};

/**
 * The host's execution as an execution trace, or null when the host
 * supplies none. Pass `enabled: false` while another execution is viewed,
 * so nothing is mapped that nobody looks at.
 *
 * One trace lasts for one execution: the host's source id, its net and the
 * instant its positions count from. The trace grows with the host's list
 * of firings and is not rebuilt for it.
 */
export const useActualModeTrace = (params: {
  enabled: boolean;
}): ExecutionTrace | null => {
  const actualMode = use(ActualModeContext);
  const { petriNetDefinition } = use(SDCPNContext);
  const [mapping, setMapping] = useState<Mapping | null>(null);

  const execution =
    params.enabled && actualMode.available && actualMode.initialState !== null
      ? actualMode
      : null;
  const initialState = execution?.initialState ?? null;
  const epochMs = execution ? getActualModeEpochMs(execution) : null;

  // The mapping is state derived from what the host supplies: it is kept
  // with the inputs it was made from, and made again when one of them is no
  // longer the one stored.
  let current = mapping;
  if (execution === null || initialState === null) {
    if (mapping !== null) {
      current = null;
      setMapping(null);
    }
  } else if (
    mapping === null ||
    mapping.sourceId !== execution.source.id ||
    mapping.definition !== petriNetDefinition ||
    mapping.epochMs !== epochMs ||
    !extendsFirings(mapping.firings, execution.transitionFirings)
  ) {
    // A new execution, or a list that is not the one the trace holds
    // continued: the trace starts over. It is filled before anything reads
    // it, so the first paint already shows the execution.
    const actual = createActualModeTrace({
      definition: petriNetDefinition,
      initialState,
      epochMs,
    });
    actual.update(execution);
    current = {
      sourceId: execution.source.id,
      definition: petriNetDefinition,
      epochMs,
      firings: execution.transitionFirings,
      actual,
    };
    setMapping(current);
  } else if (mapping.firings !== execution.transitionFirings) {
    current = { ...mapping, firings: execution.transitionFirings };
    setMapping(current);
  }

  // The trace is a store outside React: what the host reports after the
  // mapping was made is written to it once the render that brought it
  // commits.
  const actual = current?.actual ?? null;
  const status = execution?.status ?? null;
  const transitionFirings = execution?.transitionFirings ?? null;
  const timelineNowMs = execution?.timelineNowMs ?? null;
  useEffect(() => {
    if (actual && status !== null && transitionFirings !== null) {
      actual.update({ status, transitionFirings, timelineNowMs });
    }
  }, [actual, status, transitionFirings, timelineNowMs]);

  return actual?.trace ?? null;
};
