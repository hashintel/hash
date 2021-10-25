export type BlockVariant = {
  description?: string;
  displayName?: string;
  icon?: string;
  properties?: JSONObject;
};

/**
 * @todo type all as unknown and check properly
 * we can't rely on people defining the JSON correctly
 */
export type BlockMetadata = {
  author?: string;
  description?: string;
  displayName?: string;
  externals?: Record<string, string>;
  license?: string;
  icon?: string;
  name?: string;
  schema?: string;
  source?: string;
  variants?: BlockVariant[];
  version?: string;
};

export type BlockProtocolUpdatePayload<T> = {
  entityTypeId?: string | null;
  entityTypeVersionId?: string | null;
  entityId: string;
  accountId?: string | null;
  data: T;
};

export type BlockProtocolCreatePayload<T> = {
  entityTypeId: string;
  entityTypeVersionId?: string | null;
  data: T;
  pageAccountId: string;
  userId: string;
};

export type BlockProtocolFilterOperatorType =
  | "CONTAINS"
  | "DOES_NOT_CONTAIN"
  | "IS"
  | "IS_NOT"
  | "STARTS_WITH"
  | "ENDS_WITH"
  | "IS_EMPTY"
  | "IS_NOT_EMPTY";

export type BlockProtocolMultiFilterOperatorType = "AND" | "OR";

export type BlockProtocolAggregateOperationInput = {
  pageNumber?: number;
  itemsPerPage?: number;
  multiSort?:
    | {
        field: string;
        desc?: boolean | undefined | null;
      }[]
    | null;
  multiFilter?: {
    filters: {
      field: string;
      operator: BlockProtocolFilterOperatorType;
      value: string;
    }[];
    operator: BlockProtocolMultiFilterOperatorType;
  } | null;
};

export type BlockProtocolLinkedDataDefinition = {
  aggregate?: BlockProtocolAggregateOperationInput & { pageCount?: number };
  entityTypeId?: string;
  entityId?: string;
};

export type BlockProtocolAggregatePayload = {
  entityTypeId: string;
  entityTypeVersionId?: string | null;
  operation: BlockProtocolAggregateOperationInput;
  accountId: string;
};

export type BlockProtocolCreateFn = {
  <T>(actions: BlockProtocolCreatePayload<T>[]): Promise<unknown[]>;
};

export type BlockProtocolUpdateFn = {
  <T>(actions: BlockProtocolUpdatePayload<T>[]): Promise<unknown[]>;
};

export type BlockProtocolAggregateFn = {
  (action: BlockProtocolAggregatePayload): Promise<unknown>;
};

export type BlockProtocolFunction =
  | BlockProtocolAggregateFn
  | BlockProtocolCreateFn
  | BlockProtocolUpdateFn;

export type JSONValue =
  | null
  | boolean
  | number
  | string
  | JSONValue[]
  | JSONObject;

export type JSONObject = { [key: string]: JSONValue };

export interface JSONArray extends Array<JSONValue> {}

/**
 * Block Protocol-specified properties,
 * which the embedding application should provide.
 */
export type BlockProtocolProps = {
  aggregate?: BlockProtocolAggregateFn;
  aggregateLoading?: boolean;
  aggregateError?: Error;
  create?: BlockProtocolCreateFn;
  createLoading?: boolean;
  createError?: Error;
  entityId?: string;
  entityTypeId?: string;
  id?: string;
  schemas?: Record<string, JSONObject>;
  type?: string;
  update?: BlockProtocolUpdateFn;
  updateLoading?: boolean;
  updateError?: Error;
};
