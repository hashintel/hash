export const parseActualModeTimestampMs = (
  timestamp: string,
): number | null => {
  const parsed = Date.parse(timestamp);

  return Number.isFinite(parsed) ? parsed : null;
};

export const parseRequiredActualModeTimestampMs = (
  timestamp: string,
): number => {
  const timestampMs = parseActualModeTimestampMs(timestamp);

  if (timestampMs === null) {
    throw new Error(`Invalid Actual mode event timestamp: ${timestamp}`);
  }

  return timestampMs;
};
