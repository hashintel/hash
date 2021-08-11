export type Maybe<T> = T | null;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
  Date: any;
  JSONObject: any;
};

export type Account = User | Org;

export type AggregateOperation = {
  filter?: Maybe<FilterOperation>;
  perPage: Scalars['Int'];
  page: Scalars['Int'];
  sort: Scalars['String'];
};

export type AggregateOperationInput = {
  filter?: Maybe<FilterOperationInput>;
  perPage?: Maybe<Scalars['Int']>;
  page?: Maybe<Scalars['Int']>;
  sort?: Maybe<SortOperationInput>;
};

export type AggregationResponse = {
  operation?: Maybe<AggregateOperation>;
  results: Array<Entity>;
};

export type Block = Entity & {
  properties: BlockProperties;
  /** The id of the entity */
  id: Scalars['ID'];
  /** The FIXED id for an account */
  accountId: Scalars['ID'];
  /** The date the entity was created */
  createdAt: Scalars['Date'];
  /** The user who created the entity */
  createdById: Scalars['ID'];
  /** The date the entity was last updated */
  updatedAt: Scalars['Date'];
  /** The visibility level of the entity */
  visibility: Visibility;
  /** The type of entity */
  type: Scalars['String'];
  /** The ID of the entity's version timeline. Null if this is a non-versioned entity. */
  historyId?: Maybe<Scalars['ID']>;
  /** The version timeline of the entity. Null if this is an non-versioned entity. */
  history?: Maybe<Array<EntityVersion>>;
  /** The metadata ID of the entity. This is shared across all versions of the same entity. */
  metadataId: Scalars['ID'];
};

export type BlockProperties = {
  entityId: Scalars['ID'];
  accountId: Scalars['ID'];
  entity: Entity;
  entityType: Scalars['String'];
  componentId: Scalars['ID'];
};


export type Embed = {
  html: Scalars['String'];
  providerName: Scalars['String'];
};

export type Entity = {
  /** The id of the entity */
  id: Scalars['ID'];
  /** The FIXED id for an account */
  accountId: Scalars['ID'];
  /** The date the entity was created */
  createdAt: Scalars['Date'];
  /** The user who created the entity */
  createdById: Scalars['ID'];
  /** The date the entity was last updated */
  updatedAt: Scalars['Date'];
  /** The visibility level of the entity */
  visibility: Visibility;
  /** The type of entity */
  type: Scalars['String'];
  /** The ID of the entity's version timeline. Null if this is a non-versioned entity. */
  historyId?: Maybe<Scalars['ID']>;
  /** The version timeline of the entity. Null if this is an non-versioned entity. */
  history?: Maybe<Array<EntityVersion>>;
  /** The metadata ID of the entity. This is shared across all versions of the same entity. */
  metadataId: Scalars['ID'];
};

/** A schema describing and validating a specific type of entity */
export type EntityType = Entity & {
  /** The name of the entity type */
  name: Scalars['String'];
  /**
   * The shape of the entity, expressed as a JSON Schema
   * https://json-schema.org/
   */
  properties: Scalars['JSONObject'];
  /** The id of the entity */
  id: Scalars['ID'];
  /** The FIXED id for an account */
  accountId: Scalars['ID'];
  /** The date the entity was created */
  createdAt: Scalars['Date'];
  /** The user who created the entity */
  createdById: Scalars['ID'];
  /** The date the entity was last updated */
  updatedAt: Scalars['Date'];
  /** The visibility level of the entity */
  visibility: Visibility;
  /** The type of entity */
  type: Scalars['String'];
  /** The ID of the entity's version timeline. Null if this is a non-versioned entity. */
  historyId?: Maybe<Scalars['ID']>;
  /** The version timeline of the entity. Null if this is an non-versioned entity. */
  history?: Maybe<Array<EntityVersion>>;
  /** The metadata ID of the entity. This is shared across all versions of the same entity. */
  metadataId: Scalars['ID'];
};

export type EntityVersion = {
  /** The entity ID of this version */
  entityId: Scalars['ID'];
  /** The time this version was created. */
  createdAt: Scalars['Date'];
};

export type FilterOperation = {
  field: Scalars['String'];
  value: Scalars['String'];
};

export type FilterOperationInput = {
  field: Scalars['String'];
  value: Scalars['String'];
};


export type LoginCodeMetadata = {
  id: Scalars['ID'];
  createdAt: Scalars['Date'];
};

export enum LogoutResponse {
  Success = 'SUCCESS'
}

/** The mutation operations available in this schema */
export type Mutation = {
  /** Create an entity */
  createEntity: Entity;
  createOrg: Org;
  createPage: Page;
  createUser: User;
  /**
   * Insert a block into a given page.
   * EITHER:
   * - entityId (for rendering an existing entity) OR
   * - entityProperties and entityType (for creating a new entity)
   * must be provided.
   */
  insertBlockIntoPage: Page;
  loginWithLoginCode: User;
  logout: LogoutResponse;
  sendLoginCode: LoginCodeMetadata;
  setHealth: Scalars['Boolean'];
  /** Update an entity */
  updateEntity: Entity;
  updatePage: Page;
};


/** The mutation operations available in this schema */
export type MutationCreateEntityArgs = {
  accountId: Scalars['ID'];
  createdById: Scalars['ID'];
  properties: Scalars['JSONObject'];
  type: Scalars['String'];
  versioned?: Scalars['Boolean'];
};


/** The mutation operations available in this schema */
export type MutationCreateOrgArgs = {
  shortname: Scalars['String'];
};


/** The mutation operations available in this schema */
export type MutationCreatePageArgs = {
  accountId: Scalars['ID'];
  properties: PageCreationData;
};


/** The mutation operations available in this schema */
export type MutationCreateUserArgs = {
  email: Scalars['String'];
  shortname: Scalars['String'];
};


/** The mutation operations available in this schema */
export type MutationInsertBlockIntoPageArgs = {
  componentId: Scalars['ID'];
  entityId?: Maybe<Scalars['ID']>;
  entityProperties?: Maybe<Scalars['JSONObject']>;
  entityType?: Maybe<Scalars['String']>;
  accountId: Scalars['ID'];
  pageId: Scalars['ID'];
  position: Scalars['Int'];
};


/** The mutation operations available in this schema */
export type MutationLoginWithLoginCodeArgs = {
  loginId: Scalars['ID'];
  loginCode: Scalars['String'];
};


/** The mutation operations available in this schema */
export type MutationSendLoginCodeArgs = {
  emailOrShortname: Scalars['String'];
};


/** The mutation operations available in this schema */
export type MutationUpdateEntityArgs = {
  accountId: Scalars['ID'];
  id: Scalars['ID'];
  properties: Scalars['JSONObject'];
};


/** The mutation operations available in this schema */
export type MutationUpdatePageArgs = {
  accountId: Scalars['ID'];
  id: Scalars['ID'];
  properties: PageUpdateData;
};

export type Org = Entity & {
  properties: OrgProperties;
  /** The id of the entity */
  id: Scalars['ID'];
  /** The FIXED id for an account */
  accountId: Scalars['ID'];
  /** The date the entity was created */
  createdAt: Scalars['Date'];
  /** The user who created the entity */
  createdById: Scalars['ID'];
  /** The date the entity was last updated */
  updatedAt: Scalars['Date'];
  /** The visibility level of the entity */
  visibility: Visibility;
  /** The type of entity */
  type: Scalars['String'];
  /** The ID of the entity's version timeline. Null if this is a non-versioned entity. */
  historyId?: Maybe<Scalars['ID']>;
  /** The version timeline of the entity. Null if this is an non-versioned entity. */
  history?: Maybe<Array<EntityVersion>>;
  /** The metadata ID of the entity. This is shared across all versions of the same entity. */
  metadataId: Scalars['ID'];
};

export type OrgProperties = {
  shortname: Scalars['String'];
};

export type Page = Entity & {
  properties: PageProperties;
  /** The id of the entity */
  id: Scalars['ID'];
  /** The FIXED id for an account */
  accountId: Scalars['ID'];
  /** The date the entity was created */
  createdAt: Scalars['Date'];
  /** The user who created the entity */
  createdById: Scalars['ID'];
  /** The date the entity was last updated */
  updatedAt: Scalars['Date'];
  /** The visibility level of the entity */
  visibility: Visibility;
  /** The type of entity */
  type: Scalars['String'];
  /** The ID of the entity's version timeline. Null if this is a non-versioned entity. */
  historyId?: Maybe<Scalars['ID']>;
  /** The version timeline of the entity. Null if this is an non-versioned entity. */
  history?: Maybe<Array<EntityVersion>>;
  /** The metadata ID of the entity. This is shared across all versions of the same entity. */
  metadataId: Scalars['ID'];
};

export type PageCreationData = {
  title: Scalars['String'];
};

export type PageProperties = {
  archived?: Maybe<Scalars['Boolean']>;
  contents: Array<Block>;
  summary?: Maybe<Scalars['String']>;
  title: Scalars['String'];
};

export type PageUpdateData = {
  contents?: Maybe<Array<Scalars['JSONObject']>>;
  title?: Maybe<Scalars['String']>;
  summary?: Maybe<Scalars['String']>;
};

/** The queries available in this schema */
export type Query = {
  /** Return a list of pages belonging to an account */
  accountPages: Array<Page>;
  accounts: Array<Account>;
  /** Aggregate an entity */
  aggregateEntity: AggregationResponse;
  /** Accepts a url and returns embeddable html for it, and the provider name */
  embedCode: Embed;
  entity: UnknownEntity;
  healthCheck: Scalars['Boolean'];
  me: User;
  /** Return a page by its id */
  page: Page;
};


/** The queries available in this schema */
export type QueryAccountPagesArgs = {
  accountId: Scalars['ID'];
};


/** The queries available in this schema */
export type QueryAggregateEntityArgs = {
  accountId: Scalars['ID'];
  type: Scalars['String'];
  operation?: Maybe<AggregateOperationInput>;
};


/** The queries available in this schema */
export type QueryEmbedCodeArgs = {
  url: Scalars['String'];
  type?: Maybe<Scalars['String']>;
};


/** The queries available in this schema */
export type QueryEntityArgs = {
  accountId: Scalars['ID'];
  id?: Maybe<Scalars['ID']>;
  metadataId?: Maybe<Scalars['ID']>;
};


/** The queries available in this schema */
export type QueryPageArgs = {
  accountId: Scalars['ID'];
  id?: Maybe<Scalars['ID']>;
  metadataId?: Maybe<Scalars['ID']>;
};

export type SortOperation = {
  field: Scalars['String'];
  desc?: Maybe<Scalars['Boolean']>;
};

export type SortOperationInput = {
  field: Scalars['String'];
  desc?: Maybe<Scalars['Boolean']>;
};

export type Text = Entity & {
  properties: TextProperites;
  /** The id of the entity */
  id: Scalars['ID'];
  /** The FIXED id for an account */
  accountId: Scalars['ID'];
  /** The date the entity was created */
  createdAt: Scalars['Date'];
  /** The user who created the entity */
  createdById: Scalars['ID'];
  /** The date the entity was last updated */
  updatedAt: Scalars['Date'];
  /** The visibility level of the entity */
  visibility: Visibility;
  /** The type of entity */
  type: Scalars['String'];
  /** The ID of the entity's version timeline. Null if this is a non-versioned entity. */
  historyId?: Maybe<Scalars['ID']>;
  /** The version timeline of the entity. Null if this is an non-versioned entity. */
  history?: Maybe<Array<EntityVersion>>;
  /** The metadata ID of the entity. This is shared across all versions of the same entity. */
  metadataId: Scalars['ID'];
};

export type TextProperites = {
  texts: Array<TextPropertiesText>;
};

export type TextPropertiesText = {
  text: Scalars['String'];
  bold?: Maybe<Scalars['Boolean']>;
  underline?: Maybe<Scalars['Boolean']>;
  italics?: Maybe<Scalars['Boolean']>;
};

export type UnknownEntity = Entity & {
  properties: Scalars['JSONObject'];
  /** The id of the entity */
  id: Scalars['ID'];
  /** The FIXED id for an account */
  accountId: Scalars['ID'];
  /** The date the entity was created */
  createdAt: Scalars['Date'];
  /** The user who created the entity */
  createdById: Scalars['ID'];
  /** The date the entity was last updated */
  updatedAt: Scalars['Date'];
  /** The visibility level of the entity */
  visibility: Visibility;
  /** The type of entity */
  type: Scalars['String'];
  /** The ID of the entity's version timeline. Null if this is a non-versioned entity. */
  historyId?: Maybe<Scalars['ID']>;
  /** The version timeline of the entity. Null if this is an non-versioned entity. */
  history?: Maybe<Array<EntityVersion>>;
  /** The metadata ID of the entity. This is shared across all versions of the same entity. */
  metadataId: Scalars['ID'];
};

export type User = Entity & {
  properties: UserProperties;
  /** The id of the entity */
  id: Scalars['ID'];
  /** The FIXED id for an account */
  accountId: Scalars['ID'];
  /** The date the entity was created */
  createdAt: Scalars['Date'];
  /** The user who created the entity */
  createdById: Scalars['ID'];
  /** The date the entity was last updated */
  updatedAt: Scalars['Date'];
  /** The visibility level of the entity */
  visibility: Visibility;
  /** The type of entity */
  type: Scalars['String'];
  historyId?: Maybe<Scalars['ID']>;
  /** The version timeline of the entity. Null if this is an non-versioned entity. */
  history?: Maybe<Array<EntityVersion>>;
  /** The metadata ID of the entity. This is shared across all versions of the same entity. */
  metadataId: Scalars['ID'];
};

export type UserProperties = {
  email: Scalars['String'];
  shortname: Scalars['String'];
};

export enum Visibility {
  Private = 'PRIVATE',
  Public = 'PUBLIC'
}

export type GetAccountsQueryVariables = Exact<{ [key: string]: never; }>;


export type GetAccountsQuery = { accounts: Array<(
    { __typename: 'User' }
    & Pick<User, 'id' | 'accountId'>
    & { properties: Pick<UserProperties, 'shortname' | 'email'> }
  ) | (
    { __typename: 'Org' }
    & Pick<Org, 'id' | 'accountId'>
    & { properties: Pick<OrgProperties, 'shortname'> }
  )> };

export type GetAccountPagesQueryVariables = Exact<{
  accountId: Scalars['ID'];
}>;


export type GetAccountPagesQuery = { accountPages: Array<(
    Pick<Page, 'id'>
    & { properties: Pick<PageProperties, 'title' | 'summary'> }
  )> };

export type CreateEntityMutationVariables = Exact<{
  accountId: Scalars['ID'];
  createdById: Scalars['ID'];
  properties: Scalars['JSONObject'];
  type: Scalars['String'];
  versioned?: Scalars['Boolean'];
}>;


export type CreateEntityMutation = { createEntity: (
    { __typename: 'Block' }
    & Pick<Block, 'id' | 'createdById' | 'createdAt' | 'updatedAt' | 'accountId' | 'type' | 'visibility'>
  ) | (
    { __typename: 'EntityType' }
    & Pick<EntityType, 'id' | 'createdById' | 'createdAt' | 'updatedAt' | 'accountId' | 'type' | 'visibility'>
  ) | (
    { __typename: 'Org' }
    & Pick<Org, 'id' | 'createdById' | 'createdAt' | 'updatedAt' | 'accountId' | 'type' | 'visibility'>
  ) | (
    { __typename: 'Page' }
    & Pick<Page, 'id' | 'createdById' | 'createdAt' | 'updatedAt' | 'accountId' | 'type' | 'visibility'>
  ) | (
    { __typename: 'Text' }
    & Pick<Text, 'id' | 'createdById' | 'createdAt' | 'updatedAt' | 'accountId' | 'type' | 'visibility'>
  ) | (
    { __typename: 'UnknownEntity' }
    & Pick<UnknownEntity, 'properties' | 'id' | 'createdById' | 'createdAt' | 'updatedAt' | 'accountId' | 'type' | 'visibility'>
  ) | (
    { __typename: 'User' }
    & Pick<User, 'id' | 'createdById' | 'createdAt' | 'updatedAt' | 'accountId' | 'type' | 'visibility'>
  ) };

export type UpdateEntityMutationVariables = Exact<{
  accountId: Scalars['ID'];
  id: Scalars['ID'];
  properties: Scalars['JSONObject'];
}>;


export type UpdateEntityMutation = { updateEntity: (
    { __typename: 'Block' }
    & Pick<Block, 'id' | 'type' | 'updatedAt'>
  ) | (
    { __typename: 'EntityType' }
    & Pick<EntityType, 'id' | 'type' | 'updatedAt'>
  ) | (
    { __typename: 'Org' }
    & Pick<Org, 'id' | 'type' | 'updatedAt'>
  ) | (
    { __typename: 'Page' }
    & Pick<Page, 'id' | 'type' | 'updatedAt'>
  ) | (
    { __typename: 'Text' }
    & Pick<Text, 'id' | 'type' | 'updatedAt'>
  ) | (
    { __typename: 'UnknownEntity' }
    & Pick<UnknownEntity, 'properties' | 'id' | 'type' | 'updatedAt'>
  ) | (
    { __typename: 'User' }
    & Pick<User, 'id' | 'type' | 'updatedAt'>
  ) };

export type AggregateEntityQueryVariables = Exact<{
  accountId: Scalars['ID'];
  type: Scalars['String'];
  operation?: Maybe<AggregateOperationInput>;
}>;


export type AggregateEntityQuery = { aggregateEntity: (
    { __typename: 'AggregationResponse' }
    & { results: Array<(
      { __typename: 'Block' }
      & Pick<Block, 'id' | 'type'>
    ) | (
      { __typename: 'EntityType' }
      & Pick<EntityType, 'id' | 'type'>
    ) | (
      { __typename: 'Org' }
      & Pick<Org, 'id' | 'type'>
    ) | (
      { __typename: 'Page' }
      & Pick<Page, 'id' | 'type'>
    ) | (
      { __typename: 'Text' }
      & Pick<Text, 'id' | 'type'>
    ) | (
      { __typename: 'UnknownEntity' }
      & Pick<UnknownEntity, 'properties' | 'id' | 'type'>
    ) | (
      { __typename: 'User' }
      & Pick<User, 'id' | 'type'>
    )>, operation?: Maybe<Pick<AggregateOperation, 'page' | 'perPage' | 'sort'>> }
  ) };

export type CreateOrgMutationVariables = Exact<{
  shortname: Scalars['String'];
}>;


export type CreateOrgMutation = { createOrg: (
    { __typename: 'Org' }
    & Pick<Org, 'id' | 'createdById' | 'createdAt' | 'updatedAt' | 'accountId' | 'type' | 'visibility'>
    & { properties: Pick<OrgProperties, 'shortname'> }
  ) };

export type PageFieldsFragment = (
  { __typename: 'Page' }
  & Pick<Page, 'id' | 'accountId'>
  & { properties: (
    { __typename: 'PageProperties' }
    & Pick<PageProperties, 'archived' | 'summary' | 'title'>
    & { contents: Array<(
      Pick<Block, 'id' | 'accountId'>
      & { properties: (
        Pick<BlockProperties, 'componentId' | 'entityType'>
        & { entity: (
          { __typename: 'Block' }
          & Pick<Block, 'id' | 'accountId' | 'type'>
        ) | (
          { __typename: 'EntityType' }
          & Pick<EntityType, 'id' | 'accountId' | 'type'>
        ) | (
          { __typename: 'Org' }
          & Pick<Org, 'id' | 'accountId' | 'type'>
        ) | (
          { __typename: 'Page' }
          & Pick<Page, 'id' | 'accountId' | 'type'>
        ) | (
          { __typename: 'Text' }
          & Pick<Text, 'id' | 'accountId' | 'type'>
          & { textProperties: { texts: Array<Pick<TextPropertiesText, 'text' | 'bold' | 'underline' | 'italics'>> } }
        ) | (
          { __typename: 'UnknownEntity' }
          & Pick<UnknownEntity, 'id' | 'accountId' | 'type'>
          & { unknownProperties: UnknownEntity['properties'] }
        ) | (
          { __typename: 'User' }
          & Pick<User, 'id' | 'accountId' | 'type'>
        ) }
      ) }
    )> }
  ) }
);

export type GetPageQueryVariables = Exact<{
  accountId: Scalars['ID'];
  pageId: Scalars['ID'];
}>;


export type GetPageQuery = { page: PageFieldsFragment };

export type CreatePageMutationVariables = Exact<{
  accountId: Scalars['ID'];
  properties: PageCreationData;
}>;


export type CreatePageMutation = { createPage: PageFieldsFragment };

export type UpdatePageMutationVariables = Exact<{
  accountId: Scalars['ID'];
  id: Scalars['ID'];
  properties: PageUpdateData;
}>;


export type UpdatePageMutation = { updatePage: PageFieldsFragment };

export type InsertBlockIntoPageMutationVariables = Exact<{
  accountId: Scalars['ID'];
  componentId: Scalars['ID'];
  entityType: Scalars['String'];
  entityProperties: Scalars['JSONObject'];
  position: Scalars['Int'];
  pageId: Scalars['ID'];
}>;


export type InsertBlockIntoPageMutation = { insertBlockIntoPage: PageFieldsFragment };

export type CreateUserMutationVariables = Exact<{
  email: Scalars['String'];
  shortname: Scalars['String'];
}>;


export type CreateUserMutation = { createUser: (
    { __typename: 'User' }
    & Pick<User, 'id' | 'createdById' | 'createdAt' | 'updatedAt' | 'accountId' | 'type' | 'visibility'>
    & { properties: Pick<UserProperties, 'shortname' | 'email'> }
  ) };

export type SendLoginCodeMutationVariables = Exact<{
  emailOrShortname: Scalars['String'];
}>;


export type SendLoginCodeMutation = { sendLoginCode: Pick<LoginCodeMetadata, 'id' | 'createdAt'> };

export type LoginWithLoginCodeMutationVariables = Exact<{
  loginId: Scalars['ID'];
  loginCode: Scalars['String'];
}>;


export type LoginWithLoginCodeMutation = { loginWithLoginCode: (
    { __typename: 'User' }
    & Pick<User, 'id' | 'createdById' | 'createdAt' | 'updatedAt' | 'accountId' | 'type' | 'visibility'>
    & { properties: Pick<UserProperties, 'shortname' | 'email'> }
  ) };
