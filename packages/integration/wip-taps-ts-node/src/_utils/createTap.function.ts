import { z } from "zod";

export type TapConfig = {
  /** May be passed in */
  configType?: z.ZodType<any>;
  /** Not really used for now */
  stateType?: z.ZodType<any>;
};

type StateType<C extends TapConfig> = C["stateType"] extends z.ZodType<infer R>
  ? R
  : never;

type ConfigType<C extends TapConfig> = C["configType"] extends z.ZodType<
  infer R
>
  ? R | undefined
  : never;

/** See https://github.com/singer-io/getting-started/blob/master/docs/DISCOVERY_MODE.md#the-catalog */
export type CatalogJSON = {
  streams: Array<CatalogStreamJSON>;
};

/**
 * Some surrounding class for validating a schema.
 *
 * Kinda like a "new type" in Rust/F#, but it doesn't
 * require us to have a whole complicated JSON Schema type.
 */
export class ValidSchema {
  constructor(public readonly schema: object) {}
}
/**
 * See [Singer Spec / Metadata](https://github.com/singer-io/getting-started/blob/master/docs/DISCOVERY_MODE.md#metadata)
 *
 * @example
 * {
 *   "breadcrumb": [
 *     "properties",
 *     "_sdc_repository"
 *   ],
 *   "metadata": {
 *     "inclusion": "available"
 *   }
 * }
 */
export type CatalogStreamMetadataJSON = {
  breadcrumb: [string, ...string[]];
  metadata: {
    inclusion: "available" | "automatic";
  };
};

export type CatalogStreamJSON = {
  /**
   * The name of the stream.
   * required
   */
  stream: string;
  /**
   * The unique identifier for the stream. This is allowed to be different from the name of the stream in order to allow for sources that have duplicate stream names.
   * required
   */
  tap_stream_id: string;
  /**
   * The JSON schema for the stream.
   * required
   */
  schema: ValidSchema;
  /**
   * For a database source, the name of the table.
   * optional
   */
  table_name?: string;
  /**
   * See metadata below for an explanation
   * https://github.com/singer-io/getting-started/blob/master/docs/DISCOVERY_MODE.md#metadata
   *
   * array of metadata
   *
   * optional
   */
  metadata?: CatalogStreamMetadataJSON[];
};

export interface Tap<C extends TapConfig> {
  readonly name: string;
  readonly tap: Readonly<C>;
}

export type StreamRecorder<C extends TapConfig> = {
  /** Stream name */
  name: string;
  /**
   * Creates RECORD messages
   *
   * https://github.com/singer-io/getting-started/blob/master/docs/SPEC.md#record-message
   */
  pushRecords(records: object[], timeExtracted?: Date): void;

  /**
   * Able to update the state via a specific stream ingestion.
   *
   * One common way to treat streams is to consider them separately
   * tracking their state against the global state object.
   *
   * @param updateFn will be immediately invoked and added to the
   * messages sent to the target.
   */
  updateState(updateFn: (current: StateType<C>) => StateType<C>): void;
};

export function createTap<C extends TapConfig>(
  name: string,
  config: C,
  fns: {
    /** Must provide default state if state type is specified */
    createDefaultState: C["stateType"] extends z.ZodType<infer R>
      ? () => R
      : never;
    discover(options: {
      /** Config schema type must be specified to be able to look at config, here */
      config: ConfigType<C>;
    }): Promise<CatalogJSON>;
    start(options: {
      // /** The catalog with selected streams */
      // catalog?: CatalogJSON;
      /** State schema type must be specified to be able to look at state, here */
      config: ConfigType<C>;
      /**
       * State schema type must be specified to be able to look at state, here
       *
       * This will use `createDefaultState` if we do not initialize with a state.
       */
      initialState: StateType<C>;
      updateState(updateFn: (prev: StateType<C>) => StateType<C>): void;
      /** Attempts to add a stream if the catalog defines the stream */
      addStreamWithSchema(
        stream: string,
        schemaInfo: ValidSchema,
      ):
        | {
            /** When `false` (not selected) we do not expose the ability to push RECORD messages or update state */
            selected: false;
          }
        | ({
            /** When `true` (selected) we expose the ability to push RECORD messages and ability to update state */
            selected: true;
            // replicationType: "FULL_TABLE" | "INCREMENTAL"
          } & StreamRecorder<C>);
    }): Promise<void>;
  },
): Tap<C> {
  return {
    name,
    tap: config,
  };
}
