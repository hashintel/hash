import { z } from "zod";

import { validateBatchDates } from "./batch-dates.js";
import { isDateInEpisodeScope } from "./episode-scope.js";
import { productionScheduleSchema } from "./schema.js";
import { validateV12Schedule } from "./v12-validation.js";

import type {
  ProductionSchedule,
  ProductionScheduleDelivery,
  ProductionScheduleDispatchEvent,
  ProductionScheduleV12Batch,
} from "./schema.js";

export { inclusiveProductionScheduleSpanDays } from "./batch-dates.js";

export const deriveProductionScheduleDeliveryCoverage = ({
  deliveries,
  dispatchQuantity,
  dispatchUom,
  quantityTolerance,
}: {
  deliveries: readonly ProductionScheduleDelivery[];
  dispatchQuantity: number;
  dispatchUom: string | null;
  quantityTolerance: number;
}): ProductionScheduleDispatchEvent["delivery_coverage"] => {
  if (deliveries.length === 0) {
    return "none";
  }
  const comparable =
    dispatchUom !== null &&
    deliveries.every(
      (delivery) =>
        delivery.quantity !== undefined && delivery.uom === dispatchUom,
    );
  if (!comparable) {
    return "uom_incomparable";
  }
  let deliveredQuantity = 0;
  for (const delivery of deliveries) {
    deliveredQuantity += delivery.quantity ?? 0;
  }
  if (
    Math.abs(deliveredQuantity - dispatchQuantity) <=
    quantityTolerance + Number.EPSILON
  ) {
    return "exact";
  }
  return deliveredQuantity < dispatchQuantity ? "partial" : "over";
};

const validateDispatchBatch = ({
  dispatch,
  batch,
  dispatchKeys,
  path,
  context,
}: {
  dispatch: ProductionScheduleDispatchEvent;
  batch: ProductionScheduleV12Batch | undefined;
  dispatchKeys: Set<string>;
  path: (string | number)[];
  context: z.RefinementCtx;
}): void => {
  if (
    batch === undefined ||
    batch.material !== dispatch.material ||
    batch.batch !== dispatch.batch
  ) {
    context.addIssue({
      code: "custom",
      message: "dispatch must identify an existing matching batch",
      path: [...path, "batch_id"],
    });
    return;
  }
  const isInScope = isDateInEpisodeScope({
    episodeScope: dispatch.episode_scope,
    date: dispatch.dispatch_date,
    batch,
  });
  if (!isInScope) {
    context.addIssue({
      code: "custom",
      message:
        "dispatch date and episode scope do not match the batch lifecycle",
      path: [...path, "episode_scope"],
    });
  }
  const dispatchKey = `${dispatch.material}\0${dispatch.batch}\0${dispatch.dispatch_date}`;
  if (dispatchKeys.has(dispatchKey)) {
    context.addIssue({
      code: "custom",
      message: "only one dispatch is allowed per material, batch and day",
      path,
    });
  }
  dispatchKeys.add(dispatchKey);
};

const validateDispatches = (
  schedule: ProductionSchedule,
  batches: ReadonlyMap<string, ProductionScheduleV12Batch>,
  context: z.RefinementCtx,
): void => {
  const dispatchIds = new Set<string>();
  const dispatchKeys = new Set<string>();
  for (const [dispatchIndex, dispatch] of (
    schedule.dispatch_events ?? []
  ).entries()) {
    const path = ["dispatch_events", dispatchIndex];
    if (dispatchIds.has(dispatch.id)) {
      context.addIssue({
        code: "custom",
        message: "dispatch id must be unique",
        path: [...path, "id"],
      });
    }
    dispatchIds.add(dispatch.id);

    const deliveryKeys = dispatch.deliveries.map(
      (delivery) => `${delivery.delivery_number}\0${delivery.delivery_item}`,
    );
    if (new Set(deliveryKeys).size !== deliveryKeys.length) {
      context.addIssue({
        code: "custom",
        message: "delivery number/item pairs must be unique per dispatch",
        path: [...path, "deliveries"],
      });
    }
    if (
      dispatch.delivery_coverage !==
      deriveProductionScheduleDeliveryCoverage({
        deliveries: dispatch.deliveries,
        dispatchQuantity: dispatch.quantity,
        dispatchUom: dispatch.uom,
        quantityTolerance: schedule.quantity_tolerance,
      })
    ) {
      context.addIssue({
        code: "custom",
        message: "delivery_coverage does not match the delivery quantities",
        path: [...path, "delivery_coverage"],
      });
    }

    if (schedule.artifact_version === "1.2") {
      validateDispatchBatch({
        dispatch,
        batch: batches.get(dispatch.batch_id),
        dispatchKeys,
        path,
        context,
      });
    }
  }
};

export const validatedProductionScheduleSchema =
  productionScheduleSchema.superRefine((schedule, context) => {
    if (schedule.artifact_version === "1.2") {
      const batches = validateV12Schedule(schedule, context);
      validateDispatches(schedule, batches, context);
      return;
    }
    for (const [laneIndex, lane] of schedule.lanes.entries()) {
      for (const [batchIndex, batch] of lane.batches.entries()) {
        validateBatchDates(
          batch,
          ["lanes", laneIndex, "batches", batchIndex],
          context,
        );
      }
    }
    validateDispatches(schedule, new Map(), context);
  });

export const parseProductionSchedule = (
  // oxlint-disable-next-line typescript/no-restricted-types -- parses untrusted JSON, validated by the schema
  value: unknown,
  // oxlint-disable-next-line hash/prefer-options-object -- positional signature is used by callers across hash-api and hash-frontend
  productId?: string,
): ProductionSchedule => {
  const schedule = validatedProductionScheduleSchema.parse(value);
  if (productId !== undefined && schedule.product_id !== productId) {
    throw new z.ZodError([
      {
        code: "custom",
        message: `product_id must equal ${productId}`,
        path: ["product_id"],
      },
    ]);
  }
  return schedule;
};

export type SafeParseProductionScheduleResult =
  | { success: true; data: ProductionSchedule }
  | { success: false; error: z.ZodError };

export const safeParseProductionSchedule = (
  // oxlint-disable-next-line typescript/no-restricted-types -- parses untrusted JSON, validated by the schema
  value: unknown,
  // oxlint-disable-next-line hash/prefer-options-object -- positional signature mirrors parseProductionSchedule
  productId?: string,
): SafeParseProductionScheduleResult => {
  try {
    return {
      success: true,
      data: parseProductionSchedule(value, productId),
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, error };
    }
    const errorText = String(error);
    const message = error instanceof Error ? error.message : errorText;
    return {
      success: false,
      error: new z.ZodError([{ code: "custom", message, path: [] }]),
    };
  }
};
