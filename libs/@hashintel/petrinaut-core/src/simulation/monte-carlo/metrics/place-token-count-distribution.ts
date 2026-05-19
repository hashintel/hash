import type {
  PlaceTokenCountDistributionBin,
  PlaceTokenCountDistributionFrame,
  PlaceTokenCountDistributionMetric,
} from "./types";

function growHistogram(
  histogram: Uint32Array<ArrayBufferLike>,
  tokenCount: number,
): Uint32Array<ArrayBufferLike> {
  const nextLength = Math.max(tokenCount + 1, histogram.length * 2, 8);
  const nextHistogram = new Uint32Array(nextLength);
  nextHistogram.set(histogram);
  return nextHistogram;
}

function toSparseBins(
  histogram: Uint32Array<ArrayBufferLike>,
): PlaceTokenCountDistributionBin[] {
  const bins: PlaceTokenCountDistributionBin[] = [];

  for (let tokenCount = 0; tokenCount < histogram.length; tokenCount++) {
    const frequency = histogram[tokenCount] ?? 0;
    if (frequency > 0) {
      bins.push([tokenCount, frequency]);
    }
  }

  return bins;
}

/**
 * Creates an active-only streaming distribution metric for place token counts.
 *
 * Each observed frame stores one exact integer histogram per place. Completed
 * and errored runs do not contribute to the frame sample set.
 */
export function createPlaceTokenCountDistributionMetric(): PlaceTokenCountDistributionMetric {
  const frames: PlaceTokenCountDistributionFrame[] = [];

  return {
    get frames() {
      return frames;
    },
    getLatestFrame: () => frames.at(-1) ?? null,
    clear: () => {
      frames.length = 0;
    },
    observeFrame: (context) => {
      const histograms: Uint32Array<ArrayBufferLike>[] = context.placeIds.map(
        () => new Uint32Array(1),
      );

      context.forEachActiveRunPlaceCounts((_runIndex, placeCounts) => {
        for (
          let placeIndex = 0;
          placeIndex < context.placeIds.length;
          placeIndex++
        ) {
          const tokenCount = placeCounts[placeIndex] ?? 0;
          let histogram = histograms[placeIndex]!;
          if (tokenCount >= histogram.length) {
            histogram = growHistogram(histogram, tokenCount);
            histograms[placeIndex] = histogram;
          }

          histogram[tokenCount] = (histogram[tokenCount] ?? 0) + 1;
        }
      });

      frames.push({
        frameNumber: context.frameNumber,
        time: context.time,
        runCount: context.runCount,
        activeRunCount: context.activeRunCount,
        completedRunCount: context.completedRunCount,
        erroredRunCount: context.erroredRunCount,
        places: context.placeIds.map((placeId, placeIndex) => ({
          placeId,
          placeName: context.placeNames[placeIndex] ?? placeId,
          sampleCount: context.activeRunCount,
          bins: toSparseBins(histograms[placeIndex]!),
        })),
      });
    },
  };
}
