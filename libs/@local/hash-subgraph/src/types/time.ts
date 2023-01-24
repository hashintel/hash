import { Timestamp } from "./identifier";

export type TimeIntervalBound =
  | {
      bound: "unbounded";
    }
  | {
      bound: "included" | "excluded";
      timestamp: Timestamp;
    };

export type DecisionTimeProjection = {
  kernel: {
    axis: "transaction";
    timestamp: Timestamp | null;
  };
  image: {
    axis: "decision";
    start: TimeIntervalBound | null;
    end: TimeIntervalBound | null;
  };
};

export type TransactionTimeProjection = {
  kernel: {
    axis: "decision";
    timestamp: Timestamp | null;
  };
  image: {
    axis: "transaction";
    start: TimeIntervalBound | null;
    end: TimeIntervalBound | null;
  };
};

export type TimeProjection = DecisionTimeProjection | TransactionTimeProjection;

export type ResolvedDecisionTimeProjection = {
  kernel: {
    axis: "transaction";
    timestamp: Timestamp;
  };
  image: {
    axis: "decision";
    start: TimeIntervalBound;
    end: TimeIntervalBound;
  };
};

export type ResolvedTransactionTimeProjection = {
  kernel: {
    axis: "decision";
    timestamp: Timestamp;
  };
  image: {
    axis: "transaction";
    start: TimeIntervalBound;
    end: TimeIntervalBound;
  };
};

export type ResolvedTimeProjection =
  | ResolvedDecisionTimeProjection
  | ResolvedTransactionTimeProjection;
