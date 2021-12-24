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
  image?: string;
  name?: string;
  schema?: string;
  source?: string;
  variants?: BlockVariant[];
  version?: string;
};

export type BlockProtocolUpdateEntitiesAction<T> = {
  entityTypeId?: string | null;
  entityTypeVersionId?: string | null;
  entityId: string;
  accountId?: string | null;
  data: T;
};

export type BlockProtocolCreateEntitiesAction<T> = {
  entityTypeId: string;
  entityTypeVersionId?: string | null;
  data: T;
  accountId?: string;
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

export type BlockProtocolMultiFilter = {
  filters: {
    field: string;
    operator: BlockProtocolFilterOperatorType;
    value: string;
  }[];
  operator: BlockProtocolMultiFilterOperatorType;
};

export type BlockProtocolMultiSort = {
  field: string;
  desc?: boolean | undefined | null;
}[];

export type BlockProtocolAggregateOperationInput = {
  pageNumber?: number;
  itemsPerPage?: number;
  multiSort?: BlockProtocolMultiSort | null;
  multiFilter?: BlockProtocolMultiFilter | null;
};

export type BlockProtocolLinkedDataDefinition = {
  aggregate?: BlockProtocolAggregateOperationInput & { pageCount?: number };
  entityTypeId?: string;
  entityId?: string;
};

export type BlockProtocolAggregateEntitiesPayload = {
  entityTypeId?: string;
  entityTypeVersionId?: string | null;
  operation: BlockProtocolAggregateOperationInput;
  accountId?: string;
};

export type BlockProtocolAggregateEntitiesResult<T = unknown> = {
  results: T[];
  operation: BlockProtocolAggregateOperationInput & { pageCount: number };
};

export type BlockProtocolAggregateEntityTypesPayload = {
  includeOtherTypesInUse: boolean;
};

export type BlockProtocolCreateEntitiesFunction = {
  <T>(actions: BlockProtocolCreateEntitiesAction<T>[]): Promise<unknown[]>;
};

export type BlockProtocolUpdateEntitiesFunction = {
  <T>(actions: BlockProtocolUpdateEntitiesAction<T>[]): Promise<unknown[]>;
};

export type BlockProtocolAggregateEntitiesFunction = {
  (
    payload: BlockProtocolAggregateEntitiesPayload,
  ): Promise<BlockProtocolAggregateEntitiesResult>;
};

export type BlockProtocolFileMediaType = "image" | "video";

export type BlockProtocolUploadFileFunction = {
  (action: {
    file?: File;
    url?: string;
    mediaType: BlockProtocolFileMediaType;
  }): Promise<{
    entityId: string;
    url: string;
    mediaType: BlockProtocolFileMediaType;
  }>;
};

export type BlockProtocolEntityType = {
  entityTypeId: string;
  $id: string;
  $schema: string;
  title: string;
  type: string;
  [key: string]: JSONValue;
};

export type BlockProtocolEntity = {
  accountId: string;
  entityId: string;
  entityTypeId: string;
  [key: string]: JSONValue;
};

export type BlockProtocolLink = {
  sourceEntityId: string;
  destinationEntityId: string;
  destinationEntityVersionId?: string | null;
  index?: number | null;
  path: string;
};

export type BlockProtocolLinkGroup = {
  sourceEntityId: string;
  sourceEntityVersionId: string;
  path: string;
  links: BlockProtocolLink[];
};

export type BlockProtocolCreateLinksAction = {
  sourceAccountId?: string | null;
  sourceEntityId: string;
  destinationAccountId?: string | null;
  destinationEntityId: string;
  destinationEntityVersionId?: string | null;
  index?: number | null;
  path: string;
};

export type BlockProtocolCreateLinksFunction = {
  (actions: BlockProtocolCreateLinksAction[]): Promise<BlockProtocolLink[]>;
};

export type BlockProtocolDeleteLinksAction = {
  sourceAccountId?: string | null;
  sourceEntityId: string;
  index?: number | null;
  path: string;
};

export type BlockProtocolDeleteLinksFunction = {
  (actions: BlockProtocolDeleteLinksAction[]): Promise<boolean[]>;
};

export type BlockProtocolAggregateEntityTypesFunction = {
  (payload: BlockProtocolAggregateEntityTypesPayload): Promise<
    BlockProtocolAggregateEntitiesResult<BlockProtocolEntityType>
  >;
};

type BlockProtocolUpdateEntityTypesAction = {
  entityId: string;
  schema: JSONObject;
};

export type BlockProtocolUpdateEntityTypesFunction = {
  (actions: BlockProtocolUpdateEntityTypesAction[]): Promise<
    BlockProtocolEntityType[]
  >;
};

export type BlockProtocolFunction =
  | BlockProtocolAggregateEntitiesFunction
  | BlockProtocolAggregateEntityTypesFunction
  | BlockProtocolCreateEntitiesFunction
  | BlockProtocolUpdateEntitiesFunction
  | BlockProtocolUpdateEntityTypesFunction;

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
  aggregateEntities?: BlockProtocolAggregateEntitiesFunction;
  aggregateEntitiesLoading?: boolean;
  aggregateEntitiesError?: Error;
  aggregateEntityTypes?: BlockProtocolAggregateEntityTypesFunction;
  createEntities?: BlockProtocolCreateEntitiesFunction;
  createEntitiesLoading?: boolean;
  createEntitiesError?: Error;
  createLinks?: BlockProtocolCreateLinksFunction;
  createLinksLoading?: boolean;
  createLinksError?: Error;
  deleteLinks?: BlockProtocolDeleteLinksFunction;
  deleteLinksLoading?: boolean;
  deleteLinksError?: Error;
  entityId?: string;
  entityTypeId?: string;
  linkedEntities?: BlockProtocolEntity[];
  linkGroups?: BlockProtocolLinkGroup[];
  id?: string;
  schemas?: Record<string, JSONObject>;
  type?: string;
  updateEntities?: BlockProtocolUpdateEntitiesFunction;
  updateEntitiesLoading?: boolean;
  updateEntitiesError?: Error;
  updateEntityTypes?: BlockProtocolUpdateEntityTypesFunction;
  updateEntityTypesLoading?: boolean;
  updateEntityTypesError?: Error;
};
