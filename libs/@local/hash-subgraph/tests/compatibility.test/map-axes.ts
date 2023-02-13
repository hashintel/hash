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
} from "@local/hash-subgraph/main";

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
          : image.start.bound === "unbounded"
          ? {
              kind: "unbounded",
            }
          : {
              kind:
                image.start.bound === "included" ? "inclusive" : "exclusive",
              limit: image.start.timestamp as Timestamp,
            },
      end:
        image.end === null || image.end.bound === "unbounded"
          ? null
          : {
              kind: image.end.bound === "included" ? "inclusive" : "exclusive",
              limit: image.end.timestamp as Timestamp,
            },
    };
  };
  return timeProjection.kernel.axis === "transaction"
    ? {
        pinned: {
          axis: "transactionTime",
          timestamp: timeProjection.kernel.timestamp as Timestamp,
        },
        variable: {
          axis: "decisionTime",
          interval: mapInterval(timeProjection.image),
        },
      }
    : {
        pinned: {
          axis: "decisionTime",
          timestamp: timeProjection.kernel.timestamp as Timestamp,
        },
        variable: {
          axis: "transactionTime",
          interval: mapInterval(timeProjection.image),
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
        image.start.bound === "unbounded"
          ? {
              kind: "unbounded",
            }
          : {
              kind:
                image.start.bound === "included" ? "inclusive" : "exclusive",
              limit: image.start.timestamp as Timestamp,
            },
      end:
        image.end.bound === "unbounded"
          ? {
              kind: "inclusive",
              /** @todo-0.3 - This is incorrect, the Graph API shouldn't allow unbounded resolved intervals */
              limit: new Date("3000-01-01").toISOString() as Timestamp,
            }
          : {
              kind: image.end.bound === "included" ? "inclusive" : "exclusive",
              limit: image.end.timestamp as Timestamp,
            },
    };
  };
  return timeProjection.kernel.axis === "transaction"
    ? {
        pinned: {
          axis: "transactionTime",
          timestamp: timeProjection.kernel.timestamp as Timestamp,
        },
        variable: {
          axis: "decisionTime",
          interval: mapInterval(timeProjection.image),
        },
      }
    : {
        pinned: {
          axis: "decisionTime",
          timestamp: timeProjection.kernel.timestamp as Timestamp,
        },
        variable: {
          axis: "transactionTime",
          interval: mapInterval(timeProjection.image),
        },
      };
};
