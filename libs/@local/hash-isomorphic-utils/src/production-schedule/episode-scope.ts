import type { ProductionScheduleV12Batch } from "./schema.js";

/**
 * Whether a dated event's episode scope is consistent with the lifecycle of the batch it belongs to.
 */
export const isDateInEpisodeScope = ({
  episodeScope,
  date,
  batch,
}: {
  episodeScope: "in_episode" | "pre_receipt" | "post_depletion";
  date: string;
  batch: ProductionScheduleV12Batch;
}): boolean => {
  const isWithinLifecycle =
    date >= batch.lifecycle_start && date <= batch.lifecycle_end;

  if (episodeScope === "in_episode") {
    return isWithinLifecycle;
  }
  if (episodeScope === "pre_receipt") {
    return (
      batch.lifecycle_balance_status === "unknown_opening_balance" &&
      isWithinLifecycle
    );
  }
  return (
    batch.lifecycle_balance_status === "over_depleted" &&
    batch.lifecycle_end_reason === "depleted" &&
    date > batch.lifecycle_end
  );
};
