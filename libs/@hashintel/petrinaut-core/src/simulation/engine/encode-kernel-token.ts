import { isDistribution } from "../authoring/user-code/distribution";
import { isUuidSentinel } from "../authoring/user-code/uuid-runtime";
import { sampleDistribution } from "./sample-distribution";
import { encodeTokenValuesToBytes } from "./token-layout";
import { encodeTokenAttributeValue } from "./token-values";
import { generateUuidFromRng, toUuid } from "./uuid";

import type { Color } from "../../types/sdcpn";
import type { StringPoolWriter, TokenSlotLayout } from "./token-layout";
import type { TransitionKernelOutput } from "./types";

type ColorElement = Color["elements"][number];

type KernelOutputToken = TransitionKernelOutput[string][number];

/**
 * Resolves one transition kernel output token into a stride-sized byte block,
 * consuming RNG state where needed. Values are resolved in element
 * declaration order so RNG consumption stays deterministic per seed:
 *
 * - `Distribution` values are sampled (only valid for `real` elements —
 *   discrete elements, including `uuid`, throw).
 * - `uuid` elements: omitted (`undefined`) or `Uuid.generate()` draws a fresh
 *   UUID from the seeded RNG; `Uuid.from(value)` and plain values are coerced
 *   via the total `toUuid` conversion. Forwarding an input token's uuid is
 *   plain bigint pass-through.
 * - `string` elements: the value stringifies (`undefined`/`null` → `""`) and
 *   is interned into the run's `stringPool`; the buffer stores the pool ID.
 * - Everything else goes through the shared number-slot codec.
 */
export function encodeKernelOutputToken({
  token,
  elements,
  tokenLayout,
  rngState,
  transitionId,
  placeName,
  stringPool,
}: {
  token: KernelOutputToken;
  elements: readonly ColorElement[];
  tokenLayout: TokenSlotLayout;
  rngState: number;
  transitionId: string;
  placeName: string;
  stringPool: StringPoolWriter;
}): { bytes: Uint8Array; nextRngState: number } {
  let currentRngState = rngState;
  const encodedByName: Record<string, number | bigint> = {};

  for (const element of elements) {
    const raw = token[element.name];

    if (isDistribution(raw)) {
      if (element.type !== "real") {
        throw new Error(
          `Transition ${transitionId} produced a distribution for discrete element ${element.name}.`,
        );
      }
      const [sampled, nextRng] = sampleDistribution(raw, currentRngState);
      currentRngState = nextRng;
      encodedByName[element.name] = sampled;
      continue;
    }

    if (element.type === "string") {
      // Untyped user code may hand back anything, including null.
      const rawValue: unknown = raw;
      const text =
        rawValue === undefined || rawValue === null
          ? ""
          : typeof rawValue === "string"
            ? rawValue
            : // eslint-disable-next-line typescript/no-base-to-string -- intentional: total, deterministic stringification
              String(rawValue);
      encodedByName[element.name] = BigInt(stringPool.intern(text));
      continue;
    }

    if (element.type === "uuid") {
      if (
        raw === undefined ||
        (isUuidSentinel(raw) && raw.__petrinautUuid === "generate")
      ) {
        const [generated, nextRng] = generateUuidFromRng(currentRngState);
        currentRngState = nextRng;
        encodedByName[element.name] = generated;
      } else if (isUuidSentinel(raw)) {
        encodedByName[element.name] = toUuid(raw.value);
      } else {
        encodedByName[element.name] = toUuid(raw);
      }
      continue;
    }

    encodedByName[element.name] = encodeTokenAttributeValue(
      element,
      raw,
      `Transition ${transitionId} output ${placeName}.${element.name}`,
    );
  }

  return {
    bytes: encodeTokenValuesToBytes(tokenLayout, encodedByName),
    nextRngState: currentRngState,
  };
}
