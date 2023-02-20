import { TemporalAxes, UnresolvedTemporalAxes } from "@local/hash-graph-client";

import {
  QueryTemporalAxes,
  QueryTemporalAxesUnresolved,
  Timestamp,
} from "../types";

export const mapUnresolvedTemporalAxes = (
  temporalAxes: UnresolvedTemporalAxes,
): QueryTemporalAxesUnresolved => {
  const mapInterval = (
    variable: UnresolvedTemporalAxes["variable"],
  ): QueryTemporalAxesUnresolved["variable"]["interval"] => {
    return {
      start:
        variable.start === null
          ? null
          : variable.start.kind === "unbounded"
          ? {
              kind: "unbounded",
            }
          : {
              kind: variable.start.kind,
              limit: variable.start.limit as Timestamp,
            },
      end:
        variable.end === null
          ? null
          : {
              kind: variable.end.kind,
              limit: variable.end.limit as Timestamp,
            },
    };
  };
  return temporalAxes.pinned.axis === "transactionTime"
    ? {
        pinned: {
          axis: "transactionTime",
          timestamp: temporalAxes.pinned.timestamp as Timestamp,
        },
        variable: {
          axis: "decisionTime",
          interval: mapInterval(temporalAxes.variable),
        },
      }
    : {
        pinned: {
          axis: "decisionTime",
          timestamp: temporalAxes.pinned.timestamp as Timestamp,
        },
        variable: {
          axis: "transactionTime",
          interval: mapInterval(temporalAxes.variable),
        },
      };
};

export const mapTemporalAxes = (
  temporalAxes: TemporalAxes,
): QueryTemporalAxes => {
  const mapInterval = (
    variable: TemporalAxes["variable"],
  ): QueryTemporalAxes["variable"]["interval"] => {
    return {
      start:
        variable.start.kind === "unbounded"
          ? {
              kind: "unbounded",
            }
          : {
              kind: variable.start.kind,
              limit: variable.start.limit as Timestamp,
            },
      end: {
        kind: variable.end.kind,
        limit: variable.end.limit as Timestamp,
      },
    };
  };
  return temporalAxes.pinned.axis === "transactionTime"
    ? {
        pinned: {
          axis: "transactionTime",
          timestamp: temporalAxes.pinned.timestamp as Timestamp,
        },
        variable: {
          axis: "decisionTime",
          interval: mapInterval(temporalAxes.variable),
        },
      }
    : {
        pinned: {
          axis: "decisionTime",
          timestamp: temporalAxes.pinned.timestamp as Timestamp,
        },
        variable: {
          axis: "transactionTime",
          interval: mapInterval(temporalAxes.variable),
        },
      };
};
