/** 61_500 ms → `1m 2s`; 3_723_000 → `1h 2m`; sub-second dwell shows as `0s`. */
export const formatDwellMs = (dwellMs: number): string => {
  const totalSeconds = Math.max(0, Math.floor(dwellMs / 1_000));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
};
