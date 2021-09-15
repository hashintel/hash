export type BlockProps = object;

export type BlockVariant = {
  description?: string;
  icon?: string;
  name?: string;
  properties?: BlockProps;
};

/**
 * @todo type all as unknown and check properly
 * we can't rely on people defining the JSON correctly
 */
export type BlockMetadata = {
  author?: string;
  description?: string;
  externals?: Record<string, string>;
  license?: string;
  name?: string;
  schema?: string;
  source?: string;
  variants?: BlockVariant[];
  version?: string;
};

export type BlockProtocolUpdatePayload<T> = {
  entityTypeId?: string;
  entityTypeVersionId?: string;
  entityId: string;
  accountId?: string;
  data: T;
};

export type BlockProtocolCreatePayload<T> = {
  entityTypeId: string;
  entityTypeVersionId?: string;
  data: T;
  pageAccountId: string;
  userId: string;
};

export type BlockProtocolAggregateOperation = {
  page?: number;
  perPage?: number;
  sort?: {
    field: string;
    desc?: boolean | undefined;
  };
};

export type BlockProtocolAggregatePayload = {
  entityTypeId: string;
  entityTypeVersionId?: string;
  operation: BlockProtocolAggregateOperation;
  accountId: string;
};

export type BlockProtocolCreateFn = {
  <T>(actions: BlockProtocolCreatePayload<T>[]): void;
};

export type BlockProtocolUpdateFn = {
  <T>(actions: BlockProtocolUpdatePayload<T>[]): Promise<void>;
};

export type BlockProtocolAggregateFn = {
  (action: BlockProtocolAggregatePayload): void;
};

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
  aggregate?: BlockProtocolCreateFn;
  aggregateLoading?: boolean;
  aggregateError?: Error;
  create?: BlockProtocolCreateFn;
  createLoading?: boolean;
  createError?: Error;
  id?: string;
  schemas?: Record<string, JSONObject>;
  type?: string;
  update?: BlockProtocolUpdateFn;
  updateLoading?: boolean;
  updateError?: Error;
};
