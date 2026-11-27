import {
  validatePropertiesWithMetadata,
  validatePropertyPatches,
} from "./property-values.js";
import {
  allPayloadKinds,
  payloadKindTraits,
  storedArrayPayloadKinds,
  storedPayloadKinds,
} from "./types.js";

import type { ConnectionSource, ConnectionTarget } from "./can-connect.js";
import type {
  BuiltSource,
  Payload,
  PayloadKind,
  PropertyValueSource,
  StepInputSource,
  ValueSource,
} from "./types.js";
import type {
  PropertyObjectWithMetadata,
  PropertyPatchOperation,
  PropertyWithMetadata,
} from "@blockprotocol/type-system";

/*
 * Sources that build one value from several: an entity's properties, or the changes to them, where each property's
 * value has a source of its own. Every value a built source takes is one of its parts. Anything that follows a step's
 * connections reads them with `getValueSources`, and an executor builds the input's payload with `buildSourcePayload`
 * once it has a value for every part.
 */

const storedKinds: readonly PayloadKind[] = [
  ...storedPayloadKinds,
  ...storedArrayPayloadKinds,
];

/**
 * The kinds of value a property can take from a source: those that are one primitive value underneath. A kind that can
 * be stored by reference isn't one, as a reference built into properties is never resolved: an item of a stored list
 * of entity IDs is a reference to it.
 */
const propertyValueKinds: readonly PayloadKind[] = allPayloadKinds.filter(
  (kind) =>
    payloadKindTraits[kind].primitive !== null && !storedKinds.includes(kind),
);

/** What can feed a property's value: one value of a kind a property can hold, which is always present. */
export const propertyValueTarget: ConnectionTarget = {
  oneOfPayloadKinds: propertyValueKinds,
  array: false,
  required: true,
};

export const isBuiltSource = (source: StepInputSource): source is BuiltSource =>
  source.kind === "properties" || source.kind === "property-patches";

/** One of the values a built source takes. */
type SourcePart = {
  /** Identifies the part within its source. */
  key: string;
  /** Where the part's own source is within the built source, e.g. `["values", "https://…/name/", "from"]`. */
  path: (string | number)[];
  from: ValueSource;
};

const getPropertyPartKey = (propertyBaseUrl: string) => propertyBaseUrl;

/* A patch is identified by its position, as an invalid list may patch one property twice. */
const getPatchPartKey = (patchIndex: number) => String(patchIndex);

/** The values a built source takes, in the order it lists them. A removal takes none. */
export const getSourceParts = (source: BuiltSource): SourcePart[] =>
  source.kind === "properties"
    ? Object.entries(source.values).map(([propertyBaseUrl, { from }]) => ({
        key: getPropertyPartKey(propertyBaseUrl),
        path: ["values", propertyBaseUrl, "from"],
        from,
      }))
    : source.patches.flatMap((patch, patchIndex) =>
        patch.op === "remove"
          ? []
          : [
              {
                key: getPatchPartKey(patchIndex),
                path: ["patches", patchIndex, "from"],
                from: patch.from,
              },
            ],
      );

/** Every value a step input takes: its source, or each part of a built one. */
export const getValueSources = (source: StepInputSource): ValueSource[] =>
  isBuiltSource(source)
    ? getSourceParts(source).map(({ from }) => from)
    : [source];

/**
 * A step input's source with each value source it takes replaced by what `mapValueSource` returns for it. Returns the
 * source itself if none changes.
 */
export const mapValueSources = (
  source: StepInputSource,
  mapValueSource: (valueSource: ValueSource) => ValueSource,
): StepInputSource => {
  if (!isBuiltSource(source)) {
    return mapValueSource(source);
  }

  const mapPart = <Part extends { from: ValueSource }>(part: Part): Part => {
    const from = mapValueSource(part.from);

    return from === part.from ? part : { ...part, from };
  };

  if (source.kind === "properties") {
    const values = Object.entries(source.values).map(
      ([propertyBaseUrl, valueSource]) =>
        [propertyBaseUrl, mapPart(valueSource)] as const,
    );

    return values.every(
      ([propertyBaseUrl, valueSource]) =>
        valueSource === source.values[propertyBaseUrl],
    )
      ? source
      : { ...source, values: Object.fromEntries(values) };
  }

  const patches = source.patches.map((patch) =>
    patch.op === "remove" ? patch : mapPart(patch),
  );

  return patches.every((patch, index) => patch === source.patches[index])
    ? source
    : { ...source, patches };
};

/** The shape of the value a built source builds, which is always present. */
export const getBuiltSourceShape = (source: BuiltSource): ConnectionSource =>
  source.kind === "properties"
    ? {
        payloadKind: "PropertyObjectWithMetadata",
        array: false,
        required: true,
      }
    : { payloadKind: "PropertyPatch", array: true, required: true };

/**
 * Builds the payload a built source gives its input, from the value of each of its parts: the same payload a constant
 * with those values would give.
 */
export const buildSourcePayload = (
  source: BuiltSource,
  getPartValue: (partKey: string) => unknown,
): Payload => {
  /* A definition's strings are checked as base URLs and data type IDs when it's validated (`validateBuiltSource`). */
  const toProperty = (partKey: string, { dataTypeId }: PropertyValueSource) =>
    ({
      value: getPartValue(partKey),
      metadata: { dataTypeId },
    }) as PropertyWithMetadata;

  if (source.kind === "properties") {
    return {
      kind: "PropertyObjectWithMetadata",
      value: {
        value: Object.fromEntries(
          Object.entries(source.values).map(
            ([propertyBaseUrl, valueSource]) => [
              propertyBaseUrl,
              toProperty(getPropertyPartKey(propertyBaseUrl), valueSource),
            ],
          ),
        ),
      } as PropertyObjectWithMetadata,
    };
  }

  return {
    kind: "PropertyPatch",
    value: source.patches.map((patch, patchIndex) =>
      patch.op === "remove"
        ? { op: patch.op, path: patch.path }
        : {
            op: patch.op,
            path: patch.path,
            property: toProperty(getPatchPartKey(patchIndex), patch),
          },
    ) as PropertyPatchOperation[],
  };
};

/**
 * Checks a built source apart from where its values come from, returning why it's invalid: what it builds must pass
 * the check a constant does, whatever values it's given.
 */
export const validateBuiltSource = (
  source: BuiltSource,
): string | undefined => {
  const { value } = buildSourcePayload(source, () => null);

  return source.kind === "properties"
    ? validatePropertiesWithMetadata(value as PropertyObjectWithMetadata)
    : validatePropertyPatches(value as PropertyPatchOperation[]);
};
