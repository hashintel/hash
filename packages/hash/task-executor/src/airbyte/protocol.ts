/**
 * auto-generated from
 * https://github.com/airbytehq/airbyte/blob/master/airbyte-protocol/models/src/main/resources/airbyte_protocol/airbyte_protocol.yaml
 * converted to JSON and then converted to Typescript Interfaces, using
 * https://transform.tools/json-schema-to-typescript
 */

export type DestinationSyncMode = "append" | "overwrite" | "append_dedup";
export type SyncMode = "full_refresh" | "incremental";

/**
 * AirbyteProtocol structs
 */
export interface AirbyteProtocol {
  airbyte_message?: AirbyteMessage;
  configured_airbyte_catalog?: ConfiguredAirbyteCatalog;
  [k: string]: unknown;
}
export interface AirbyteMessage {
  /**
   * Message type
   */
  type: "RECORD" | "STATE" | "LOG" | "SPEC" | "CONNECTION_STATUS" | "CATALOG";
  /**
   * log message: any kind of logging you want the platform to know about.
   */
  log?: {
    /**
     * the type of logging
     */
    level:
      | "FATAL"
      | "CRITICAL"
      | "ERROR"
      | "WARN"
      | "WARNING"
      | "INFO"
      | "DEBUG"
      | "TRACE";
    /**
     * the log message
     */
    message: string;
    [k: string]: unknown;
  };
  spec?: ConnectorSpecification;
  connectionStatus?: AirbyteConnectionStatus;
  /**
   * log message: any kind of logging you want the platform to know about.
   */
  catalog?: {
    streams: AirbyteStream[];
    [k: string]: unknown;
  };
  /**
   * record message: the record
   */
  record?: {
    /**
     * the name of this record's stream
     */
    stream: string;
    /**
     * the record data
     */
    data: {
      [k: string]: unknown;
    };
    /**
     * when the data was emitted from the source. epoch in millisecond.
     */
    emitted_at: number;
    /**
     * the namespace of this record's stream
     */
    namespace?: string;
    [k: string]: unknown;
  };
  /**
   * schema message: the state. Must be the last message produced. The platform uses this information
   */
  state?: {
    /**
     * the state data
     */
    data: {
      [k: string]: unknown;
    };
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
/**
 * Specification of a connector (source/destination)
 */
export interface ConnectorSpecification {
  documentationUrl?: string;
  changelogUrl?: string;
  /**
   * ConnectorDefinition specific blob. Must be a valid JSON string.
   */
  connectionSpecification: {
    [k: string]: unknown;
  };
  /**
   * If the connector supports incremental mode or not.
   */
  supportsIncremental?: boolean;
  /**
   * If the connector supports normalization or not.
   */
  supportsNormalization?: boolean;
  /**
   * If the connector supports DBT or not.
   */
  supportsDBT?: boolean;
  /**
   * List of destination sync modes supported by the connector
   */
  supported_destination_sync_modes?: DestinationSyncMode[];
  authSpecification?: {
    auth_type?: "oauth2.0";
    /**
     * If the connector supports OAuth, this field should be non-null.
     */
    oauth2Specification?: {
      /**
       * A list of strings representing a pointer to the root object which contains any oauth parameters in the ConnectorSpecification.
       * Examples:
       * if oauth parameters were contained inside the top level, rootObject=[] If they were nested inside another object {'credentials': {'app_id' etc...}, rootObject=['credentials'] If they were inside a oneOf {'switch': {oneOf: [{client_id...}, {non_oauth_param]}},  rootObject=['switch', 0]
       */
      rootObject?: string[];
      /**
       * Pointers to the fields in the rootObject needed to obtain the initial refresh/access tokens for the OAuth flow. Each inner array represents the path in the rootObject of the referenced field. For example. Assume the rootObject contains params 'app_secret', 'app_id' which are needed to get the initial refresh token. If they are not nested in the rootObject, then the array would look like this [['app_secret'], ['app_id']] If they are nested inside an object called 'auth_params' then this array would be [['auth_params', 'app_secret'], ['auth_params', 'app_id']]
       */
      oauthFlowInitParameters?: string[][];
      /**
       * Pointers to the fields in the rootObject which can be populated from successfully completing the oauth flow using the init parameters. This is typically a refresh/access token. Each inner array represents the path in the rootObject of the referenced field.
       */
      oauthFlowOutputParameters?: string[][];
      [k: string]: unknown;
    };
    [k: string]: unknown;
  };
  [k: string]: unknown;
}
/**
 * Airbyte connection status
 */
export interface AirbyteConnectionStatus {
  status: "SUCCEEDED" | "FAILED";
  message?: string;
  [k: string]: unknown;
}
export interface AirbyteStream {
  /**
   * Stream's name.
   */
  name: string;
  /**
   * Stream schema using Json Schema specs.
   */
  json_schema: {
    [k: string]: unknown;
  };
  supported_sync_modes?: SyncMode[];
  /**
   * If the source defines the cursor field, then any other cursor field inputs will be ignored. If it does not, either the user_provided one is used, or the default one is used as a backup.
   */
  source_defined_cursor?: boolean;
  /**
   * Path to the field that will be used to determine if a record is new or modified since the last sync. If not provided by the source, the end user will have to specify the comparable themselves.
   */
  default_cursor_field?: string[];
  /**
   * If the source defines the primary key, paths to the fields that will be used as a primary key. If not provided by the source, the end user will have to specify the primary key themselves.
   */
  source_defined_primary_key?: string[][];
  /**
   * Optional Source-defined namespace. Currently only used by JDBC destinations to determine what schema to write to. Airbyte streams from the same sources should have the same namespace.
   */
  namespace?: string;
  [k: string]: unknown;
}
/**
 * Airbyte stream schema catalog
 */
export interface ConfiguredAirbyteCatalog {
  streams: ConfiguredAirbyteStream[];
  [k: string]: unknown;
}
export interface ConfiguredAirbyteStream {
  stream: AirbyteStream;
  sync_mode: "full_refresh" | "incremental";
  /**
   * Path to the field that will be used to determine if a record is new or modified since the last sync. This field is REQUIRED if `sync_mode` is `incremental`. Otherwise it is ignored.
   */
  cursor_field?: string[];
  destination_sync_mode: "append" | "overwrite" | "append_dedup";
  /**
   * Paths to the fields that will be used as primary key. This field is REQUIRED if `destination_sync_mode` is `*_dedup`. Otherwise it is ignored.
   */
  primary_key?: string[][];
  [k: string]: unknown;
}
