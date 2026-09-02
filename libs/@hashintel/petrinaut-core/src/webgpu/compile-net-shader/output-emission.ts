/**
 * What a firing produces: the kernel's output tokens and each output place's
 * pending count.
 *
 * A kernel reads the tokens the firing consumes, so its values are evaluated
 * into `let`s *before* compaction destroys them and written after — the CPU
 * does the same by computing `effect.add` from the frame it then removes from
 * (`monte-carlo/advance-run.ts`).
 */
import { buildKernelContext } from "../../hir/surface-context";
import { WgslBailError, WgslEmitter } from "../emit-wgsl";
import { encodeTokenWrites, tokenSlotsValue } from "./token-layout";

import type { PetrinautExtensionSettings } from "../../extensions";
import type { HirFunction } from "../../hir/hir";
import type { SDCPN } from "../../types/sdcpn";
import type { GpuNetProfile, GpuPlaceProfile } from "../eligibility";
import type { WgslParameterValue, WgslValue } from "../emit-wgsl";
import type {
  DiscreteType,
  StateLayout,
  TokenReader,
  TokenWordWrite,
} from "./token-layout";
import type { ArcPlace } from "./transition-firing";

type Transition = SDCPN["transitions"][number];
type OutputArc = Transition["outputArcs"][number];

/** Where one output arc's tokens go, and what to write into them. */
export type KernelOutputWrite = {
  placeIndex: number;
  tokens: TokenWordWrite[][];
};

/**
 * Reads a transition kernel as the words it writes for each produced token.
 *
 * A kernel body is a record keyed by output slot name, holding one array of
 * `arc.weight` token records each — a plain `recordLit` of `arrayLit` of
 * `recordLit`, with no kernel-specific HIR node. The emitter turns those into
 * `record`/`array` values, so this walks the emitted structure the same way
 * `hir/emit-buffer-js.ts` does: look each slot up by name, and bail rather
 * than guess if it is missing or the wrong length.
 */
const emitKernel = (
  fn: HirFunction,
  parameterValues: Readonly<Record<string, WgslParameterValue>>,
  tokenSlots: ReadonlyMap<string, readonly TokenReader[]>,
  outputs: readonly {
    slotName: string;
    placeIndex: number;
    tokenCount: number;
    place: GpuPlaceProfile;
    discreteTypes: ReadonlyMap<string, DiscreteType>;
  }[],
): { statements: string[]; writes: KernelOutputWrite[] } => {
  const emitter = new WgslEmitter({
    parameterValues,
    rngStateVar: "rng_state",
  });
  const env = new Map<string, WgslValue>();
  const tokensParam = fn.params[0];
  if (tokensParam) {
    env.set(tokensParam.name, tokenSlotsValue(tokenSlots));
  }

  const result = emitter.emit(fn.body, env);
  if (result.kind !== "record") {
    throw new WgslBailError(
      "a transition kernel must return a record of output places to token arrays",
    );
  }

  const writes: KernelOutputWrite[] = [];
  for (const output of outputs) {
    const entry = result.fields.get(output.slotName);
    if (entry === undefined || entry.kind !== "array") {
      throw new WgslBailError(
        `the kernel returns no token array for output place \`${output.slotName}\``,
      );
    }
    if (entry.elements.length !== output.tokenCount) {
      throw new WgslBailError(
        `the kernel returns ${entry.elements.length} token(s) for \`${output.slotName}\`, but its arc weight is ${output.tokenCount}`,
      );
    }

    const tokens = entry.elements.map((element) => {
      // A kernel may build a token as a record literal, or forward one of its
      // input tokens (`MachinesToRepair: input.BrokenMachines`), whose fields
      // come from its reader.
      if (element.kind !== "record" && element.kind !== "token") {
        throw new WgslBailError(
          `the kernel's tokens for \`${output.slotName}\` must be records of attributes or forwarded input tokens`,
        );
      }
      return encodeTokenWrites(
        output.place,
        output.discreteTypes,
        (field) =>
          element.kind === "record"
            ? element.fields.get(field)
            : element.read(field),
        emitter,
        output.slotName,
      );
    });

    writes.push({ placeIndex: output.placeIndex, tokens });
  }

  return { statements: [...emitter.statements], writes };
};

/**
 * Emits the kernel's statements and hoists every produced value into a
 * `kout_*` let, inside the fire block before compaction. The emitter hoists
 * only the subexpressions it names, so a direct read like
 * `x: tokens.Space[0].x` would otherwise stay inline in the write and execute
 * after compaction had overwritten that slot with a survivor.
 *
 * Returns the writes with their values replaced by the hoisted names.
 */
export const emitKernelValues = (
  push: (line: string) => void,
  options: {
    transition: Transition;
    outputs: readonly ArcPlace<OutputArc>[];
    kernel: HirFunction | undefined;
    sdcpn: SDCPN;
    profile: GpuNetProfile;
    discreteTypesByPlaceId: ReadonlyMap<
      string,
      ReadonlyMap<string, DiscreteType>
    >;
    selectionTokenSlots: ReadonlyMap<string, readonly TokenReader[]>;
    parameterValues: Readonly<Record<string, WgslParameterValue>>;
    extensions: PetrinautExtensionSettings | undefined;
  },
): KernelOutputWrite[] => {
  const { transition, kernel, sdcpn, profile, extensions } = options;
  const typedOutputs = options.outputs
    .map(({ arc, placeIndex }) => ({
      arc,
      placeIndex,
      place: profile.places[placeIndex]!,
    }))
    .filter(({ place }) => place.colored);
  if (typedOutputs.length === 0) {
    return [];
  }
  if (kernel === undefined) {
    throw new WgslBailError(
      `transition \`${transition.name}\` produces typed tokens but its kernel carried no HIR, so their attributes cannot be written`,
    );
  }
  const kernelContext = buildKernelContext(sdcpn, transition, extensions);
  const emitted = emitKernel(
    kernel,
    options.parameterValues,
    options.selectionTokenSlots,
    typedOutputs.map(({ arc, placeIndex, place }, ordinal) => {
      const slotName = kernelContext.outputSlots[ordinal]?.name;
      if (slotName === undefined) {
        throw new WgslBailError(
          `transition \`${transition.name}\` has no kernel output slot for \`${place.name}\``,
        );
      }
      return {
        slotName,
        placeIndex,
        tokenCount: arc.weight,
        place,
        discreteTypes:
          options.discreteTypesByPlaceId.get(place.id) ?? new Map(),
      };
    }),
  );
  for (const statement of emitted.statements) {
    push(`        ${statement}`);
  }
  let hoistOrdinal = 0;
  return emitted.writes.map((write) => ({
    placeIndex: write.placeIndex,
    tokens: write.tokens.map((tokenWrites) =>
      tokenWrites.map(({ wordOffset, valueExpr }) => {
        const name = `kout_${hoistOrdinal}`;
        hoistOrdinal += 1;
        push(`        let ${name}: u32 = ${valueExpr};`);
        return { wordOffset, valueExpr: name };
      }),
    ),
  }));
};

/**
 * Emits the output side of the fire block, after compaction: writes each
 * produced token above the live count and defers the count itself to
 * `pending`, so nothing later in this frame can consume it — matching the
 * CPU, which applies additions after its transition loop.
 */
export const emitOutputWrites = (
  push: (line: string) => void,
  options: {
    outputs: readonly ArcPlace<OutputArc>[];
    kernelWrites: readonly KernelOutputWrite[];
    layout: StateLayout;
    profile: GpuNetProfile;
  },
): void => {
  const { layout, profile } = options;
  for (const { arc, placeIndex } of options.outputs) {
    const write = options.kernelWrites.find(
      (entry) => entry.placeIndex === placeIndex,
    );
    if (write !== undefined) {
      const stride = layout.placeTokenStrides[placeIndex]!;
      const tokenBase = layout.placeTokenOffsets[placeIndex]!;
      const outputPlace = profile.places[placeIndex]!;
      // A derived slab flags overflow at the write. The post-fold check alone
      // misses a frame that produces past the slab and then consumes back
      // below it: the out-of-slab write already happened, clamped by robust
      // buffer access onto the last slot.
      if (outputPlace.capacitySource === "derived" && write.tokens.length > 0) {
        push(
          `        if (counts[${placeIndex}u] + u32(max(0, pending[${placeIndex}u])) + ${write.tokens.length}u > ${outputPlace.capacity}u) { status = 3u; }`,
        );
      }
      for (const [tokenOrdinal, tokenWrites] of write.tokens.entries()) {
        push(`        {`);
        push(
          `          let out = base + ${tokenBase}u + (counts[${placeIndex}u] + u32(max(0, pending[${placeIndex}u])) + ${tokenOrdinal}u) * ${stride}u;`,
        );
        for (const { wordOffset, valueExpr } of tokenWrites) {
          push(`          state[out + ${wordOffset}u] = ${valueExpr};`);
        }
        push(`        }`);
      }
    }
    push(
      `        pending[${placeIndex}u] = pending[${placeIndex}u] + ${arc.weight};`,
    );
  }
};
