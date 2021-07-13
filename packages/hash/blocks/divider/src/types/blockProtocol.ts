export type BlockProtocolUpdatePayload<T> = {
  entityType: string;
  entityId: number | string;
  data: T;
};

export type BlockProtocolCreatePayload<T> = {
  entityType: string;
  data: T;
};

export type BlockProtocolAggregateOperation = {
  page?: number;
  perPage?: number;
  sort?: {
    field: string;
    desc?: boolean;
  }
};

export type BlockProtocolAggregatePayload = {
  entityType: string;
  operation: BlockProtocolAggregateOperation;
};

export type BlockProtocolCreateFn = {
  <T>(actions: BlockProtocolCreatePayload<T>[]): void;
};

export type BlockProtocolUpdateFn = {
  <T>(actions: BlockProtocolUpdatePayload<T>[]): void;
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
  | { [key: string]: JSONValue };

export interface JSONObject {
  [key: string]: JSONValue;
}
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
