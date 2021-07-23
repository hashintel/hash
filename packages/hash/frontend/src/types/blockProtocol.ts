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
