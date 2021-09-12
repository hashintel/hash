export type BlockProps = object;

type BlockVariant = {
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

export type BlockProtocolAggregateOperationInput = {
  pageNumber?: number;
  itemsPerPage?: number;
  sort?: {
    field: string;
    desc?: boolean | undefined | null;
  } | null;
  filter?: { field: string; value: string } | null;
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
