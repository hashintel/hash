export type BlockProtocolUpdatePayload<T> = {
  entityType: string;
  entityId: string;
  data: T;
};

export type BlockProtocolCreatePayload<T> = {
  entityType: string;
  data: T;
};

export type BlockProtocolAggregateOperation = {
  page?: number;
  perPage?: number;
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
  <T>(actions: BlockProtocolUpdatePayload<T>[]): Promise<void>;
};

export type BlockProtocolAggregateFn = {
  (action: BlockProtocolAggregatePayload): void;
};
