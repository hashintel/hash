/**
 * Test helper for hand-building `CompiledTransition` values with mock
 * buffer-ABI lambda/kernel programs. Mirrors `build-simulation.ts`'s
 * `createCompiledTransition` scratch allocation (placeBases/indices/
 * kernelStaging) so engine hot-path code can run against fixtures without
 * compiling real HIR artifacts. Not shipped — only imported from `*.test.ts`.
 */
import { getArcEndpointPlaceId } from "../../arc-endpoints";
import { computeTokenSlotLayout, createTokenRegionViews } from "./token-layout";

import type {
  HirCompiledBufferKernel,
  HirCompiledBufferLambda,
} from "../../hir-runtime";
import type { Color, Place, Transition } from "../../types/sdcpn";
import type { CompiledTransition } from "./types";

export function makeCompiledTransition({
  transition,
  places,
  types,
  lambdaFn,
  kernelFn = null,
}: {
  transition: Transition;
  places: Place[];
  types: Color[];
  /** Buffer-ABI mock: `(f64, u64, u8, placeBases, indices) => value`. */
  lambdaFn: HirCompiledBufferLambda;
  /** Buffer-ABI mock writing into the staging views, or null when the
   * transition has no colored output places. */
  kernelFn?: HirCompiledBufferKernel | null;
}): CompiledTransition {
  const placesMap = new Map(places.map((place) => [place.id, place]));
  const typesMap = new Map(types.map((type) => [type.id, type]));
  const getElements = (placeId: string) => {
    const place = placesMap.get(placeId);
    if (!place?.colorId) {
      return null;
    }

    return typesMap.get(place.colorId)?.elements ?? null;
  };

  const inputPlaces = transition.inputArcs.map((arc) => {
    const placeId = getArcEndpointPlaceId(arc)!;
    const elements = getElements(placeId);
    return {
      placeId,
      placeName: placesMap.get(placeId)?.name ?? placeId,
      weight: arc.weight,
      arcType: arc.type,
      elements,
      tokenLayout: elements ? computeTokenSlotLayout(elements) : null,
    };
  });
  const outputPlaces = transition.outputArcs.map((arc) => {
    const placeId = getArcEndpointPlaceId(arc)!;
    const elements = getElements(placeId);
    return {
      placeId,
      placeName: placesMap.get(placeId)?.name ?? placeId,
      weight: arc.weight,
      elements,
      tokenLayout: elements ? computeTokenSlotLayout(elements) : null,
    };
  });

  // One placeBases entry per colored non-inhibitor input arc, `weight` token
  // slots each — matching the engine's `inputPlacesWithTokenValues` filter.
  const coloredInputArcs = inputPlaces.filter(
    (inputPlace) =>
      inputPlace.arcType !== "inhibitor" &&
      inputPlace.tokenLayout !== null &&
      inputPlace.tokenLayout.strideBytes > 0,
  );
  const slotCount = coloredInputArcs.reduce(
    (sum, inputPlace) => sum + inputPlace.weight,
    0,
  );

  // Kernel staging: colored output arcs place-major, `weight` tokens each.
  const stagingSize = outputPlaces.reduce(
    (sum, outputPlace) =>
      sum + (outputPlace.tokenLayout?.strideBytes ?? 0) * outputPlace.weight,
    0,
  );
  const kernelStaging = new Uint8Array(stagingSize);

  return {
    id: transition.id,
    name: transition.name,
    inputPlaces,
    outputPlaces,
    lambdaFn,
    kernelFn,
    placeBases: new Int32Array(coloredInputArcs.length),
    indices: new Int32Array(slotCount),
    kernelStaging,
    kernelStagingViews: createTokenRegionViews(
      kernelStaging.buffer,
      0,
      kernelStaging.byteLength,
    ),
  };
}
