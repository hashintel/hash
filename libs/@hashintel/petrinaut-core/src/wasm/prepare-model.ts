import { getArcEndpointPlaceId } from "../arc-endpoints";
import {
  DEFAULT_PETRINAUT_EXTENSIONS,
  getEffectiveTransitionLambdaType,
  getTransitionLogicAvailability,
  sanitizeSDCPNForExtensions,
} from "../extensions";
import { fingerprintHirCompilationInput } from "../hir/artifact-fingerprint";
import { emitWasmModule, WasmUnsupportedError } from "./emit-module";

import type { HirFunction } from "../hir/hir";
import type { MonteCarloInitMessage } from "../simulation/monte-carlo/worker/messages";
import type { InputArcType } from "../types/sdcpn";

export type WasmTransition = {
  inputs: { place: number; weight: number; kind: InputArcType }[];
  outputs: { place: number; weight: number }[];
};

const immediate: HirFunction = {
  hirVersion: 1,
  surface: "lambda",
  params: [],
  span: { start: 0, length: 0 },
  body: {
    kind: "constant",
    name: "Infinity",
    id: 0,
    span: { start: 0, length: 0 },
  },
};

export const prepareWasmModel = (
  input: Pick<
    MonteCarloInitMessage,
    "sdcpn" | "extensions" | "hirArtifacts" | "metricSpecs"
  >,
) => {
  const extensions = input.extensions ?? DEFAULT_PETRINAUT_EXTENSIONS;
  const sdcpn = sanitizeSDCPNForExtensions(input.sdcpn, extensions);
  if ((sdcpn.componentInstances?.length ?? 0) > 0) {
    throw new WasmUnsupportedError(
      "Wasm experiments do not support subnet instances yet.",
    );
  }
  for (const place of sdcpn.places) {
    if (place.colorId !== null || place.dynamicsEnabled) {
      throw new WasmUnsupportedError(
        `Wasm experiments require uncoloured places without dynamics: ${place.name}.`,
      );
    }
    if (
      place.capacity != null &&
      (!Number.isInteger(place.capacity) ||
        place.capacity < 0 ||
        place.capacity > 0xffffffff)
    ) {
      throw new WasmUnsupportedError(
        `Place ${place.name} has an invalid capacity.`,
      );
    }
  }
  if (
    new Set(sdcpn.places.map((place) => place.name)).size !==
    sdcpn.places.length
  ) {
    throw new WasmUnsupportedError(
      "Wasm experiments require unique place names.",
    );
  }
  const runtimeVersion: unknown = input.hirArtifacts?.version;
  if (
    input.hirArtifacts &&
    (runtimeVersion !== 4 ||
      input.hirArtifacts.fingerprint !==
        fingerprintHirCompilationInput(sdcpn, extensions))
  ) {
    throw new WasmUnsupportedError(
      "Compiled HIR does not match the net or extension settings. Recompile before running.",
    );
  }
  const placeIndices = new Map(
    sdcpn.places.map((place, index) => [place.id, index]),
  );
  const transitions: WasmTransition[] = sdcpn.transitions.map((transition) => {
    const arc = (
      reference:
        | (typeof transition.inputArcs)[number]
        | (typeof transition.outputArcs)[number],
    ) => {
      const placeId = getArcEndpointPlaceId(reference);
      const place = placeId === null ? undefined : placeIndices.get(placeId);
      if (
        place === undefined ||
        !Number.isInteger(reference.weight) ||
        reference.weight <= 0 ||
        reference.weight > 0xffffffff
      ) {
        throw new WasmUnsupportedError(
          `Transition ${transition.name} has an invalid arc.`,
        );
      }
      return { place, weight: reference.weight };
    };
    const inputs = transition.inputArcs.map((inputArc) => ({
      ...arc(inputArc),
      kind: inputArc.type,
    }));
    const outputs = transition.outputArcs.map(arc);
    if (
      new Set(inputs.map((inputArc) => inputArc.place)).size !==
        inputs.length ||
      new Set(outputs.map((outputArc) => outputArc.place)).size !==
        outputs.length
    ) {
      throw new WasmUnsupportedError(
        `Wasm experiments require one arc per place in each direction: ${transition.name}.`,
      );
    }
    return { inputs, outputs };
  });
  const lambdas = sdcpn.transitions.map((transition) => {
    const availability = getTransitionLogicAvailability(
      transition,
      sdcpn,
      extensions,
    );
    if (!availability.lambda || transition.lambdaCode.trim() === "") {
      return { hir: immediate, predicate: false };
    }
    const hir = input.hirArtifacts?.lambdas[transition.id]?.hir;
    if (!hir) {
      throw new WasmUnsupportedError(
        `Wasm experiments need the compiled HIR tree for transition ${transition.name}.`,
      );
    }
    return {
      hir,
      predicate:
        getEffectiveTransitionLambdaType(transition, availability) ===
        "predicate",
    };
  });
  const metrics = (input.metricSpecs ?? []).flatMap((spec) => {
    if (spec.kind !== "expression") {
      return [];
    }
    if (!spec.artifact.hir) {
      throw new WasmUnsupportedError(
        `Wasm experiments need the compiled HIR tree for metric ${spec.label}.`,
      );
    }
    return [spec.artifact.hir];
  });
  const bytes = emitWasmModule({
    parameters: sdcpn.parameters,
    places: sdcpn.places,
    lambdas,
    metrics,
  });
  return { sdcpn, extensions, transitions, bytes };
};
