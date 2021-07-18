export type BlockProtocolUpdatePayload<T> = {
  entityType: string;
  entityId: string;
  accountId: string;
  data: T;
};

export type BlockProtocolCreatePayload<T> = {
  entityType: string;
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
  entityType: string;
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
