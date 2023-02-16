import {
  DecisionTimeImage,
  TimeProjection,
  TransactionTimeImage,
  UnresolvedDecisionTimeImage,
  UnresolvedTimeProjection,
  UnresolvedTransactionTimeImage,
} from "@local/hash-graph-client";
import {
  QueryTemporalAxes,
  QueryTemporalAxesUnresolved,
  Timestamp,
} from "@local/hash-subgraph";

export const mapUnresolvedTimeProjection = (
  timeProjection: UnresolvedTimeProjection,
): QueryTemporalAxesUnresolved => {
  const mapInterval = (
    image: UnresolvedTransactionTimeImage | UnresolvedDecisionTimeImage,
  ): QueryTemporalAxesUnresolved["variable"]["interval"] => {
    return {
      start:
        image.start === null
          ? null
          : image.start.kind === "unbounded"
          ? {
              kind: "unbounded",
            }
          : {
              kind: image.start.kind,
              limit: image.start.limit as Timestamp,
            },
      end:
        image.end === null
          ? null
          : {
              kind: image.end.kind,
              limit: image.end.limit as Timestamp,
            },
    };
  };
  return timeProjection.pinned.axis === "transactionTime"
    ? {
        pinned: {
          axis: "transactionTime",
          timestamp: timeProjection.pinned.timestamp as Timestamp,
        },
        variable: {
          axis: "decisionTime",
          interval: mapInterval(timeProjection.variable),
        },
      }
    : {
        pinned: {
          axis: "decisionTime",
          timestamp: timeProjection.pinned.timestamp as Timestamp,
        },
        variable: {
          axis: "transactionTime",
          interval: mapInterval(timeProjection.variable),
        },
      };
};

export const mapTimeProjection = (
  timeProjection: TimeProjection,
): QueryTemporalAxes => {
  const mapInterval = (
    image: TransactionTimeImage | DecisionTimeImage,
  ): QueryTemporalAxes["variable"]["interval"] => {
    return {
      start:
        image.start.kind === "unbounded"
          ? {
              kind: "unbounded",
            }
          : {
              kind: image.start.kind,
              limit: image.start.limit as Timestamp,
            },
      end: {
        kind: image.end.kind,
        limit: image.end.limit as Timestamp,
      },
    };
  };
  return timeProjection.pinned.axis === "transactionTime"
    ? {
        pinned: {
          axis: "transactionTime",
          timestamp: timeProjection.pinned.timestamp as Timestamp,
        },
        variable: {
          axis: "decisionTime",
          interval: mapInterval(timeProjection.variable),
        },
      }
    : {
        pinned: {
          axis: "decisionTime",
          timestamp: timeProjection.pinned.timestamp as Timestamp,
        },
        variable: {
          axis: "transactionTime",
          interval: mapInterval(timeProjection.variable),
        },
      };
};
