// import init from "@blockprotocol/type-system-rs";

import type {
  EntityMetadata as EntityMetadataBp,
  LinkData,
  PropertyObject,
  VersionedUrl,
} from "@blockprotocol/type-system-rs";

// export type InitInput =
//   | RequestInfo
//   | URL
//   | Response
//   | BufferSource
//   | WebAssembly.Module;
//
// let wasmInit: (() => InitInput) | undefined = undefined;
// export const setWasmInit = (arg: () => InitInput) => {
//   wasmInit = arg;
// };
//
// let initialized: Promise<void> | undefined = undefined;
// export class TypeSystemInitializer {
//   private constructor() {}
//
//   /**
//    * Initializes the package. There is a one time global setup fee (sub 30ms), but subsequent
//    * requests to initialize will be instantaneous, so it's not imperative to reuse the same parser.
//    */
//   public static initialize = async (options?: InitInput) => {
//     if (initialized === undefined) {
//       const loadModule = options ?? (wasmInit ? wasmInit() : undefined);
//       initialized = init(loadModule).then(() => undefined);
//     }
//
//     await initialized;
//     return new TypeSystemInitializer();
//   };
// }

/**
 * Ensures that the array has at least one element. If not it returns `undefined`.
 *
 * @todo: Remove when Typescript can infer this
 * @see https://github.com/microsoft/TypeScript/issues/29841
 */
export const atLeastOne = <T>(array: T[]): [T, ...T[]] | undefined =>
  // @ts-expect-error –– @see https://github.com/microsoft/TypeScript/issues/29841
  array.length > 0 ? (array satisfies [T, ...T[]]) : undefined;

export const mustHaveAtLeastOne = <T>(array: T[]): [T, ...T[]] => {
  const arr = atLeastOne(array);

  if (!arr) {
    throw new Error("Array must have at least one element.");
  }

  return arr;
};

export type Entity<Properties extends PropertyObject | null = PropertyObject> =
  {
    metadata: EntityMetadata;
    linkData?: LinkData;
  } & (Properties extends null
    ? { properties?: never }
    : { properties: Properties });

// setWasmInit(() => (typeof wasm === "function" ? wasm() : wasm));

export type EntityMetadata<
  EntityTypeIds extends [VersionedUrl, ...VersionedUrl[]] = [
    VersionedUrl,
    ...VersionedUrl[],
  ],
> = Omit<EntityMetadataBp, "entityTypeIds"> & {
  entityTypeIds: EntityTypeIds;
};
