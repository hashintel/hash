import { Timestamp } from "./identifier";

export type TimespanBound =
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
    timestamp?: Timestamp;
  };
  image: {
    axis: "decision";
    start?: TimespanBound;
    end?: TimespanBound;
  };
};

export type TransactionTimeProjection = {
  kernel: {
    axis: "decision";
    timestamp?: Timestamp;
  };
  image: {
    axis: "transaction";
    start?: TimespanBound;
    end?: TimespanBound;
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
    start: TimespanBound;
    end: TimespanBound;
  };
};

export type ResolvedTransactionTimeProjection = {
  kernel: {
    axis: "decision";
    timestamp: Timestamp;
  };
  image: {
    axis: "transaction";
    start: TimespanBound;
    end: TimespanBound;
  };
};

export type ResolvedTimeProjection =
  | ResolvedDecisionTimeProjection
  | ResolvedTransactionTimeProjection;
