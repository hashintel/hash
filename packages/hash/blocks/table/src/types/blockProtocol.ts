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

export type JSON = JSONObject | JSONArray;

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
  limit?: number;
  sort?: string;
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
  <T>(action: BlockProtocolAggregatePayload): Promise<T>;
};
