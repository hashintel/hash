/**
 * Metric bodies sampled on the device.
 *
 * Metric code reads `state.places.<name>.count` and `.tokens`. The `state`
 * record built here binds each root place to the shader's live count and a
 * span over its token slots, and `emitMetricSample` emits the metric HIR as
 * one f32 sample expression with the statements it hoists. The same binder
 * serves the device-free probe (`try-translate-metric.ts`) with placeholder
 * reads, so the eligibility gate and the shader agree on what translates.
 */
import {
  WgslBailError,
  WgslEmitter,
  wgslStringBailReason,
  wgslUuidBailReason,
} from "../emit-wgsl";
import { makeTokenReader, tokenSlotExpr } from "./token-layout";

import type { HirFunction } from "../../hir/hir";
import type { HirMetricContext } from "../../hir/surface-context";
import type { GpuNetProfile } from "../eligibility";
import type {
  WgslParameterValue,
  WgslTokenReader,
  WgslValue,
} from "../emit-wgsl";
import type { DiscreteType, StateLayout } from "./token-layout";

/** One root place as metric code sees it, resolved last-wins by display name. */
export type MetricPlaceBinding = {
  name: string;
  /** WGSL u32 expression for the place's live token count. */
  count: string;
  readAt: (indexVar: string) => WgslTokenReader;
};

/**
 * `state` for a metric body: `{ places: { <name>: { count, tokens } } }`.
 *
 * Bindings are set in order, so a duplicate display name resolves to the
 * last place — the rule `buildMetricContext` and the CPU evaluator follow.
 */
export const metricStateValue = (
  places: readonly MetricPlaceBinding[],
): WgslValue => {
  const placesByName = new Map<string, WgslValue>();
  for (const place of places) {
    placesByName.set(place.name, {
      kind: "record",
      fields: new Map<string, WgslValue>([
        ["count", { kind: "f32", code: `f32(${place.count})` }],
        [
          "tokens",
          { kind: "tokenSpan", count: place.count, readAt: place.readAt },
        ],
      ]),
    });
  }
  return {
    kind: "record",
    fields: new Map<string, WgslValue>([
      ["places", { kind: "record", fields: placesByName }],
    ]),
  };
};

/**
 * Bindings over the real layout, in profile order: the count register and a
 * token reader over the place's slots.
 */
export const layoutPlaceBindings = (
  profile: GpuNetProfile,
  layout: StateLayout,
  discreteTypesByPlaceId: ReadonlyMap<
    string,
    ReadonlyMap<string, DiscreteType>
  >,
): MetricPlaceBinding[] =>
  profile.places.map((place, index) => ({
    name: place.name,
    count: `counts[${index}u]`,
    readAt: (indexVar) =>
      makeTokenReader(
        place,
        discreteTypesByPlaceId.get(place.id) ?? new Map<string, DiscreteType>(),
        tokenSlotExpr(layout, index, indexVar),
      ),
  }));

/**
 * Placeholder bindings for the device-free probe: count `0u`; a `boolean`
 * attribute reads `false`, a numeric one `0.0`, a `string` or `uuid` one
 * bails as the emitter does for such a value, and an unknown attribute bails
 * as the layout reader does.
 */
export const probePlaceBindings = (
  context: HirMetricContext,
): MetricPlaceBinding[] =>
  context.places.map((place) => ({
    name: place.name,
    count: "0u",
    readAt: () => (fieldName) => {
      const element = place.elements.find(
        (candidate) => candidate.name === fieldName,
      );
      if (element === undefined) {
        throw new WgslBailError(
          `place \`${place.name}\` has no attribute \`${fieldName}\``,
        );
      }
      switch (element.type) {
        case "boolean":
          return { kind: "bool", code: "false" };
        case "real":
        case "integer":
          return { kind: "f32", code: "0.0" };
        case "string":
          throw new WgslBailError(wgslStringBailReason);
        case "uuid":
          throw new WgslBailError(wgslUuidBailReason);
      }
    },
  }));

/**
 * Emits one metric body: the hoisted statements first, then the f32 sample
 * expression. `hir.params[0]` is `state`; metrics are deterministic and the
 * typechecker rejects distributions outside kernels, so the emitter gets no
 * generator.
 */
export const emitMetricSample = (
  hir: HirFunction,
  options: {
    state: WgslValue;
    parameterValues: Readonly<Record<string, WgslParameterValue>>;
    identifierScope: string;
  },
): { statements: string[]; code: string } => {
  const emitter = new WgslEmitter({
    parameterValues: options.parameterValues,
    identifierScope: options.identifierScope,
  });
  const env = new Map<string, WgslValue>();
  const stateParam = hir.params[0];
  if (stateParam) {
    env.set(stateParam.name, options.state);
  }
  const value = emitter.emit(hir.body, env);
  return { statements: emitter.statements, code: emitter.f32(value) };
};
