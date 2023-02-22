import {
  QueryTemporalAxes as QueryTemporalAxesGraphApi,
  QueryTemporalAxesUnresolved as QueryTemporalAxesUnresolvedGraphApi,
} from "@local/hash-graph-client";
import {
  QueryTemporalAxes,
  QueryTemporalAxesUnresolved,
  Timestamp,
} from "@local/hash-subgraph";

const mapVariableTemporalAxisUnresolvedInterval = (
  interval: QueryTemporalAxesUnresolvedGraphApi["variable"]["interval"],
): QueryTemporalAxesUnresolved["variable"]["interval"] => {
  return {
    start:
      interval.start === null
        ? null
        : interval.start.kind === "unbounded"
        ? {
            kind: "unbounded",
          }
        : {
            kind: interval.start.kind,
            limit: interval.start.limit as Timestamp,
          },
    end:
      interval.end === null
        ? null
        : {
            kind: interval.end.kind,
            limit: interval.end.limit as Timestamp,
          },
  };
};

export const mapQueryTemporalAxesUnresolved = (
  temporalAxes: QueryTemporalAxesUnresolvedGraphApi,
): QueryTemporalAxesUnresolved => {
  if (
    temporalAxes.pinned.axis === "transactionTime" &&
    temporalAxes.variable.axis === "decisionTime"
  ) {
    return {
      pinned: {
        axis: temporalAxes.pinned.axis,
        timestamp: temporalAxes.pinned.timestamp as Timestamp,
      },
      variable: {
        axis: temporalAxes.variable.axis,
        interval: mapVariableTemporalAxisUnresolvedInterval(
          temporalAxes.variable.interval,
        ),
      },
    };
  } else if (
    temporalAxes.pinned.axis === "decisionTime" &&
    temporalAxes.variable.axis === "transactionTime"
  ) {
    return {
      pinned: {
        axis: temporalAxes.pinned.axis,
        timestamp: temporalAxes.pinned.timestamp as Timestamp,
      },
      variable: {
        axis: temporalAxes.variable.axis,
        interval: mapVariableTemporalAxisUnresolvedInterval(
          temporalAxes.variable.interval,
        ),
      },
    };
  }

  throw new Error(
    `Unexpected combination of pinned and variable axes, pinned: ${temporalAxes.pinned.axis}, variable: ${temporalAxes.variable.axis}}`,
  );
};

const mapVariableTemporalAxisInterval = (
  interval: QueryTemporalAxesGraphApi["variable"]["interval"],
): QueryTemporalAxes["variable"]["interval"] => {
  return {
    start:
      interval.start.kind === "unbounded"
        ? {
            kind: "unbounded",
          }
        : {
            kind: interval.start.kind,
            limit: interval.start.limit as Timestamp,
          },
    end: {
      kind: interval.end.kind,
      limit: interval.end.limit as Timestamp,
    },
  };
};

export const mapQueryTemporalAxes = (
  temporalAxes: QueryTemporalAxesGraphApi,
): QueryTemporalAxes => {
  if (
    temporalAxes.pinned.axis === "transactionTime" &&
    temporalAxes.variable.axis === "decisionTime"
  ) {
    return {
      pinned: {
        axis: temporalAxes.pinned.axis,
        timestamp: temporalAxes.pinned.timestamp as Timestamp,
      },
      variable: {
        axis: temporalAxes.variable.axis,
        interval: mapVariableTemporalAxisInterval(
          temporalAxes.variable.interval,
        ),
      },
    };
  } else if (
    temporalAxes.pinned.axis === "decisionTime" &&
    temporalAxes.variable.axis === "transactionTime"
  ) {
    return {
      pinned: {
        axis: temporalAxes.pinned.axis,
        timestamp: temporalAxes.pinned.timestamp as Timestamp,
      },
      variable: {
        axis: temporalAxes.variable.axis,
        interval: mapVariableTemporalAxisInterval(
          temporalAxes.variable.interval,
        ),
      },
    };
  }

  throw new Error(
    `Unexpected combination of pinned and variable axes, pinned: ${temporalAxes.pinned.axis}, variable: ${temporalAxes.variable.axis}}`,
  );
};
