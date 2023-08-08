import { GraphResolveDepths } from "@blockprotocol/graph";
import { QueryTemporalAxesUnresolved } from "@local/hash-subgraph";

export const zeroedGraphResolveDepths: GraphResolveDepths = {
  inheritsFrom: { outgoing: 0 },
  constrainsValuesOn: { outgoing: 0 },
  constrainsPropertiesOn: { outgoing: 0 },
  constrainsLinksOn: { outgoing: 0 },
  constrainsLinkDestinationsOn: { outgoing: 0 },
  isOfType: { outgoing: 0 },
  hasLeftEntity: { incoming: 0, outgoing: 0 },
  hasRightEntity: { incoming: 0, outgoing: 0 },
};

/**
 * Slices the datastore across this instant of time.
 *
 * Used to be passed as `temporalAxes` to structural queries.
 */
export const currentTimeInstantTemporalAxes: QueryTemporalAxesUnresolved = {
  pinned: {
    axis: "transactionTime",
    timestamp: null,
  },
  variable: {
    axis: "decisionTime",
    interval: {
      start: null,
      end: null,
    },
  },
};

/**
 * According to the database's most up-to-date knowledge (transaction time),
 * return the full history of entities and the times at which those decisions
 * were made.
 *
 * Used to be passed as `temporalAxes` to structural queries.
 */
export const fullDecisionTimeAxis: QueryTemporalAxesUnresolved = {
  pinned: {
    axis: "transactionTime",
    timestamp: null,
  },
  variable: {
    axis: "decisionTime",
    interval: {
      start: {
        kind: "unbounded",
      },
      end: null,
    },
  },
};
