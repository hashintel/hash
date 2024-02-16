use std::{collections::HashSet, mem};

use async_trait::async_trait;
use authorization::{
    schema::{
        DataTypeRelationAndSubject, DataTypeViewerSubject, EntityRelationAndSubject,
        EntityTypeInstantiatorSubject, EntityTypeRelationAndSubject, EntityTypeViewerSubject,
        PropertyTypeRelationAndSubject, PropertyTypeViewerSubject, WebOwnerSubject,
    },
    zanzibar::Consistency,
    AuthorizationApi,
};
use error_stack::{Report, Result, ResultExt};
use graph_types::{
    account::AccountId,
    knowledge::{
        entity::{EntityEmbedding, EntityMetadata, EntityProperties, EntityUuid},
        link::LinkData,
    },
    ontology::{
        DataTypeMetadata, EntityTypeEmbedding, EntityTypeMetadata, EntityTypeWithMetadata,
        OntologyTemporalMetadata, OntologyType, OntologyTypeClassificationMetadata,
        OntologyTypeMetadata, OntologyTypeReference, OntologyTypeVersion, PartialDataTypeMetadata,
        PartialEntityTypeMetadata, PartialPropertyTypeMetadata, PropertyTypeEmbedding,
        PropertyTypeMetadata, PropertyTypeWithMetadata,
    },
    owned_by_id::OwnedById,
};
use tarpc::context;
use temporal_client::TemporalClient;
use temporal_versioning::{DecisionTime, Timestamp, TransactionTime};
use tokio::net::ToSocketAddrs;
use tokio_serde::formats::Json;
use type_fetcher::fetcher::{FetchedOntologyType, FetcherClient};
use type_system::{
    url::{BaseUrl, VersionedUrl},
    DataType, EntityType, EntityTypeReference, PropertyType,
};

use crate::{
    ontology::domain_validator::DomainValidator,
    store::{
        account::{InsertAccountGroupIdParams, InsertAccountIdParams, InsertWebIdParams},
        crud::{QueryResult, Read, ReadPaginated, Sorting},
        knowledge::{
            CreateEntityParams, EntityQueryCursor, GetEntityParams, UpdateEntityParams,
            ValidateEntityError, ValidateEntityParams,
        },
        ontology::{
            ArchiveDataTypeParams, CreateDataTypeParams, GetDataTypesParams,
            UnarchiveDataTypeParams, UpdateDataTypeEmbeddingParams, UpdateDataTypesParams,
        },
        query::{Filter, OntologyQueryPath},
        AccountStore, ConflictBehavior, DataTypeStore, EntityStore, EntityTypeStore,
        InsertionError, PropertyTypeStore, QueryError, QueryRecord, StoreError, StorePool,
        SubgraphRecord, UpdateError,
    },
    subgraph::{
        edges::GraphResolveDepths,
        identifier::{EntityTypeVertexId, PropertyTypeVertexId, VertexId},
        query::StructuralQuery,
        temporal_axes::{
            PinnedTemporalAxisUnresolved, QueryTemporalAxes, QueryTemporalAxesUnresolved,
            VariableTemporalAxisUnresolved,
        },
        Subgraph,
    },
};

#[async_trait]
pub trait TypeFetcher {
    /// Fetches the provided type reference and inserts it to the Graph.
    async fn insert_external_ontology_type<A: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut A,
        temporal_client: Option<&TemporalClient>,
        reference: OntologyTypeReference<'_>,
    ) -> Result<OntologyTypeMetadata, InsertionError>;
}

#[derive(Clone)]
struct TypeFetcherConnectionInfo<A> {
    address: A,
    config: tarpc::client::Config,
    domain_validator: DomainValidator,
}

pub struct FetchingPool<P, A> {
    pool: P,
    connection_info: Option<TypeFetcherConnectionInfo<A>>,
}

impl<P, A> FetchingPool<P, A>
where
    A: ToSocketAddrs,
{
    pub fn new(pool: P, address: A, domain_validator: DomainValidator) -> Self {
        Self {
            pool,
            connection_info: Some(TypeFetcherConnectionInfo {
                address,
                config: tarpc::client::Config::default(),
                domain_validator,
            }),
        }
    }

    pub const fn new_offline(pool: P) -> Self {
        Self {
            pool,
            connection_info: None,
        }
    }
}

#[async_trait]
impl<P, A> StorePool for FetchingPool<P, A>
where
    P: StorePool + Send + Sync,
    A: ToSocketAddrs + Send + Sync + Clone,
{
    type Error = P::Error;
    type Store<'pool> = FetchingStore<P::Store<'pool>, A>;

    async fn acquire(&self) -> Result<Self::Store<'_>, Self::Error> {
        Ok(FetchingStore {
            store: self.pool.acquire().await?,
            connection_info: self.connection_info.clone(),
        })
    }

    async fn acquire_owned(&self) -> Result<Self::Store<'static>, Self::Error> {
        Ok(FetchingStore {
            store: self.pool.acquire_owned().await?,
            connection_info: self.connection_info.clone(),
        })
    }
}

pub struct FetchingStore<S, A> {
    store: S,
    connection_info: Option<TypeFetcherConnectionInfo<A>>,
}

const DATA_TYPE_RELATIONSHIPS: [DataTypeRelationAndSubject; 1] =
    [DataTypeRelationAndSubject::Viewer {
        subject: DataTypeViewerSubject::Public,
        level: 0,
    }];
const PROPERTY_TYPE_RELATIONSHIPS: [PropertyTypeRelationAndSubject; 1] =
    [PropertyTypeRelationAndSubject::Viewer {
        subject: PropertyTypeViewerSubject::Public,
        level: 0,
    }];
const ENTITY_TYPE_RELATIONSHIPS: [EntityTypeRelationAndSubject; 2] = [
    EntityTypeRelationAndSubject::Viewer {
        subject: EntityTypeViewerSubject::Public,
        level: 0,
    },
    EntityTypeRelationAndSubject::Instantiator {
        subject: EntityTypeInstantiatorSubject::Public,
        level: 0,
    },
];

impl<S, A> FetchingStore<S, A>
where
    S: Sync,
    A: ToSocketAddrs + Send + Sync,
{
    fn connection_info(&self) -> Result<&TypeFetcherConnectionInfo<A>, StoreError> {
        self.connection_info.as_ref().ok_or_else(|| {
            Report::new(StoreError)
                .attach_printable("type fetcher is not available in offline mode")
        })
    }

    /// Creates the client to fetch types from.
    ///
    /// # Errors
    ///
    /// Returns an error if the type fetcher is not available.
    pub async fn fetcher_client(&self) -> Result<FetcherClient, StoreError>
    where
        A: Send + ToSocketAddrs,
    {
        let connection_info = self.connection_info()?;
        let transport =
            tarpc::serde_transport::tcp::connect(&connection_info.address, Json::default)
                .await
                .change_context(StoreError)
                .attach_printable("Could not connect to type fetcher")?;
        Ok(FetcherClient::new(connection_info.config.clone(), transport).spawn())
    }

    pub fn store(&mut self) -> &mut S {
        &mut self.store
    }
}

#[derive(Default)]
#[expect(
    clippy::struct_field_names,
    reason = "Removing the postfix will be more confusing"
)]
struct FetchedOntologyTypes {
    data_types: Vec<(DataType, PartialDataTypeMetadata)>,
    property_types: Vec<(PropertyType, PartialPropertyTypeMetadata)>,
    entity_types: Vec<(EntityType, PartialEntityTypeMetadata)>,
}

#[derive(Debug)]
enum FetchBehavior {
    IncludeProvidedReferences,
    ExcludeProvidedReferences,
}

impl<'t, S, A> FetchingStore<S, A>
where
    A: ToSocketAddrs + Send + Sync,
    S: DataTypeStore + PropertyTypeStore + EntityTypeStore + Send + Sync,
{
    async fn contains_ontology_type<Au: AuthorizationApi + Send + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &Au,
        ontology_type_reference: OntologyTypeReference<'_>,
    ) -> Result<bool, StoreError> {
        fn create_query<'u, T>(versioned_url: &'u VersionedUrl) -> StructuralQuery<'u, T>
        where
            T: SubgraphRecord<QueryPath<'u>: OntologyQueryPath>,
            T::VertexId: VertexId<BaseId = BaseUrl, RevisionId = OntologyTypeVersion>,
        {
            StructuralQuery {
                filter: Filter::for_versioned_url(versioned_url),
                graph_resolve_depths: GraphResolveDepths::default(),
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(None, None),
                },
                include_drafts: true,
            }
        }

        let url = match ontology_type_reference {
            OntologyTypeReference::DataTypeReference(reference) => reference.url(),
            OntologyTypeReference::PropertyTypeReference(reference) => reference.url(),
            OntologyTypeReference::EntityTypeReference(reference) => reference.url(),
        };

        if let Ok(connection_info) = self.connection_info() {
            if connection_info
                .domain_validator
                .validate_url(url.base_url.as_str())
            {
                // If the domain is valid, we own the data type and it either exists or we cannot
                // reference it.
                return Ok(true);
            }
        }

        match ontology_type_reference {
            OntologyTypeReference::DataTypeReference(_) => {
                self.store
                    .get_data_type(
                        actor_id,
                        authorization_api,
                        GetDataTypesParams {
                            query: create_query(url),
                            after: None,
                            limit: None,
                        },
                    )
                    .await
            }
            OntologyTypeReference::PropertyTypeReference(_) => {
                self.store
                    .get_property_type(actor_id, authorization_api, &create_query(url), None, None)
                    .await
            }
            OntologyTypeReference::EntityTypeReference(_) => {
                self.store
                    .get_entity_type(actor_id, authorization_api, &create_query(url), None, None)
                    .await
            }
        }
        .change_context(StoreError)
        .attach_printable("Could not check if ontology type exists")
        .map(|subgraph| !subgraph.roots.is_empty())
    }

    #[tracing::instrument(level = "trace", skip(self, authorization_api, ontology_type))]
    async fn collect_external_ontology_types<
        'o,
        T: OntologyType + Sync,
        Au: AuthorizationApi + Send + Sync,
    >(
        &self,
        actor_id: AccountId,
        authorization_api: &Au,
        ontology_type: &'o T,
        bypassed_types: &HashSet<&VersionedUrl>,
    ) -> Result<Vec<OntologyTypeReference<'o>>, QueryError> {
        let mut references = Vec::new();
        for reference in ontology_type.traverse_references() {
            if !bypassed_types.contains(reference.url())
                && !self
                    .contains_ontology_type(actor_id, authorization_api, reference)
                    .await
                    .change_context(QueryError)?
            {
                references.push(reference);
            }
        }

        Ok(references)
    }

    #[tracing::instrument(
        level = "debug",
        skip(self, authorization_api, ontology_type_references)
    )]
    async fn fetch_external_ontology_types<Au: AuthorizationApi + Send + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &Au,
        ontology_type_references: impl IntoIterator<Item = VersionedUrl> + Send,
        fetch_behavior: FetchBehavior,
        bypassed_types: &HashSet<&VersionedUrl>,
    ) -> Result<FetchedOntologyTypes, StoreError> {
        let mut queue = ontology_type_references.into_iter().collect::<Vec<_>>();
        let mut seen = match fetch_behavior {
            FetchBehavior::IncludeProvidedReferences => HashSet::new(),
            FetchBehavior::ExcludeProvidedReferences => {
                queue.iter().cloned().collect::<HashSet<_>>()
            }
        };

        let mut fetched_ontology_types = FetchedOntologyTypes::default();
        if queue.is_empty() {
            return Ok(fetched_ontology_types);
        }

        let fetcher = self
            .fetcher_client()
            .await
            .change_context(StoreError)
            .attach_printable_lazy(|| {
                queue
                    .iter()
                    .map(ToString::to_string)
                    .collect::<Vec<_>>()
                    .join(", ")
            })?;
        loop {
            let ontology_urls = mem::take(&mut queue);
            if ontology_urls.is_empty() {
                break;
            }

            let ontology_types = {
                let span = tracing::info_span!(
                    "fetching ontology types from type fetcher",
                    urls=?ontology_urls
                );
                let _enter = span.enter();
                fetcher
                    .fetch_ontology_types(context::current(), ontology_urls)
                    .await
                    .change_context(StoreError)?
                    .change_context(StoreError)?
            };

            for (ontology_type, fetched_at) in ontology_types {
                match ontology_type {
                    FetchedOntologyType::DataType(data_type) => {
                        let metadata = PartialDataTypeMetadata {
                            record_id: data_type.id().clone().into(),
                            classification: OntologyTypeClassificationMetadata::External {
                                fetched_at,
                            },
                        };

                        for referenced_ontology_type in self
                            .collect_external_ontology_types(
                                actor_id,
                                authorization_api,
                                &data_type,
                                bypassed_types,
                            )
                            .await
                            .change_context(StoreError)?
                        {
                            if !seen.contains(referenced_ontology_type.url()) {
                                queue.push(referenced_ontology_type.url().clone());
                                seen.insert(referenced_ontology_type.url().clone());
                            }
                        }

                        fetched_ontology_types
                            .data_types
                            .push((data_type, metadata));
                    }
                    FetchedOntologyType::PropertyType(property_type) => {
                        let metadata = PartialPropertyTypeMetadata {
                            record_id: property_type.id().clone().into(),
                            classification: OntologyTypeClassificationMetadata::External {
                                fetched_at,
                            },
                        };

                        for referenced_ontology_type in self
                            .collect_external_ontology_types(
                                actor_id,
                                authorization_api,
                                &property_type,
                                bypassed_types,
                            )
                            .await
                            .change_context(StoreError)?
                        {
                            if !seen.contains(referenced_ontology_type.url()) {
                                queue.push(referenced_ontology_type.url().clone());
                                seen.insert(referenced_ontology_type.url().clone());
                            }
                        }

                        fetched_ontology_types
                            .property_types
                            .push((property_type, metadata));
                    }
                    FetchedOntologyType::EntityType(entity_type) => {
                        let metadata = PartialEntityTypeMetadata {
                            record_id: entity_type.id().clone().into(),
                            classification: OntologyTypeClassificationMetadata::External {
                                fetched_at,
                            },
                            icon: None,
                            label_property: None,
                        };

                        for referenced_ontology_type in self
                            .collect_external_ontology_types(
                                actor_id,
                                authorization_api,
                                &entity_type,
                                bypassed_types,
                            )
                            .await
                            .change_context(StoreError)?
                        {
                            if !seen.contains(referenced_ontology_type.url()) {
                                queue.push(referenced_ontology_type.url().clone());
                                seen.insert(referenced_ontology_type.url().clone());
                            }
                        }

                        fetched_ontology_types
                            .entity_types
                            .push((entity_type, metadata));
                    }
                }
            }
        }

        Ok(fetched_ontology_types)
    }

    #[tracing::instrument(level = "debug", skip(self, authorization_api, ontology_types))]
    async fn insert_external_types<'o, T, Au>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut Au,
        temporal_client: Option<&TemporalClient>,
        ontology_types: impl IntoIterator<Item = &'o T, IntoIter: Send> + Send,
        bypassed_types: &HashSet<&VersionedUrl>,
    ) -> Result<(), InsertionError>
    where
        T: OntologyType + Sync + 'o,
        Au: AuthorizationApi + Send + Sync,
    {
        // Without collecting it first, we get a "Higher-ranked lifetime error" because of the
        // limitations of Rust being able to look into a `Pin<Box<dyn Future>>`, which is returned
        // by `#[async_trait]` methods.
        let ontology_types = ontology_types.into_iter().collect::<Vec<_>>();

        let mut ontology_type_ids = HashSet::new();

        for ontology_type in ontology_types {
            let external_types = self
                .collect_external_ontology_types(
                    actor_id,
                    authorization_api,
                    ontology_type,
                    bypassed_types,
                )
                .await
                .change_context(InsertionError)?;

            ontology_type_ids.extend(
                external_types
                    .into_iter()
                    .map(|ontology_type| ontology_type.url().clone()),
            );
        }

        let fetched_ontology_types = self
            .fetch_external_ontology_types(
                actor_id,
                authorization_api,
                ontology_type_ids,
                FetchBehavior::ExcludeProvidedReferences,
                bypassed_types,
            )
            .await
            .change_context(InsertionError)?;

        if !fetched_ontology_types.data_types.is_empty() {
            self.store
                .create_data_types(
                    actor_id,
                    authorization_api,
                    temporal_client,
                    fetched_ontology_types
                        .data_types
                        .into_iter()
                        .map(|(data_type, metadata)| CreateDataTypeParams {
                            schema: data_type,
                            classification: metadata.classification,
                            relationships: DATA_TYPE_RELATIONSHIPS,
                            conflict_behavior: ConflictBehavior::Fail,
                        }),
                )
                .await?;
        }

        if !fetched_ontology_types.property_types.is_empty() {
            self.store
                .create_property_types(
                    actor_id,
                    authorization_api,
                    temporal_client,
                    fetched_ontology_types.property_types,
                    ConflictBehavior::Skip,
                    PROPERTY_TYPE_RELATIONSHIPS,
                )
                .await?;
        }

        if !fetched_ontology_types.entity_types.is_empty() {
            self.store
                .create_entity_types(
                    actor_id,
                    authorization_api,
                    temporal_client,
                    fetched_ontology_types.entity_types,
                    ConflictBehavior::Skip,
                    ENTITY_TYPE_RELATIONSHIPS,
                )
                .await?;
        }

        Ok(())
    }

    #[tracing::instrument(level = "debug", skip(self, authorization_api))]
    #[expect(
        clippy::too_many_arguments,
        reason = "https://linear.app/hash/issue/H-1466/revisit-parameters-to-store-functions"
    )]
    async fn insert_external_types_by_reference<Au: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut Au,
        temporal_client: Option<&TemporalClient>,
        reference: OntologyTypeReference<'_>,
        on_conflict: ConflictBehavior,
        fetch_behavior: FetchBehavior,
        bypassed_types: &HashSet<&VersionedUrl>,
    ) -> Result<Vec<OntologyTypeMetadata>, InsertionError> {
        if on_conflict == ConflictBehavior::Fail
            || !self
                .contains_ontology_type(actor_id, authorization_api, reference)
                .await
                .change_context(InsertionError)?
        {
            let fetched_ontology_types = self
                .fetch_external_ontology_types(
                    actor_id,
                    authorization_api,
                    [reference.url().clone()],
                    fetch_behavior,
                    bypassed_types,
                )
                .await
                .change_context(InsertionError)?;

            let created_data_types = if fetched_ontology_types.data_types.is_empty() {
                Vec::new()
            } else {
                self.store
                    .create_data_types(
                        actor_id,
                        authorization_api,
                        temporal_client,
                        fetched_ontology_types.data_types.into_iter().map(
                            |(data_type, metadata)| CreateDataTypeParams {
                                schema: data_type,
                                classification: metadata.classification,
                                relationships: DATA_TYPE_RELATIONSHIPS,
                                conflict_behavior: on_conflict,
                            },
                        ),
                    )
                    .await?
            };

            let created_property_types = if fetched_ontology_types.property_types.is_empty() {
                Vec::new()
            } else {
                self.store
                    .create_property_types(
                        actor_id,
                        authorization_api,
                        temporal_client,
                        fetched_ontology_types.property_types,
                        ConflictBehavior::Skip,
                        PROPERTY_TYPE_RELATIONSHIPS,
                    )
                    .await?
            };

            let created_entity_types = if fetched_ontology_types.entity_types.is_empty() {
                Vec::new()
            } else {
                self.store
                    .create_entity_types(
                        actor_id,
                        authorization_api,
                        temporal_client,
                        fetched_ontology_types.entity_types,
                        ConflictBehavior::Skip,
                        ENTITY_TYPE_RELATIONSHIPS,
                    )
                    .await?
            };

            Ok(created_data_types
                .into_iter()
                .map(OntologyTypeMetadata::DataType)
                .chain(
                    created_property_types
                        .into_iter()
                        .map(OntologyTypeMetadata::PropertyType),
                )
                .chain(
                    created_entity_types
                        .into_iter()
                        .map(OntologyTypeMetadata::EntityType),
                )
                .collect())
        } else {
            Ok(Vec::new())
        }
    }
}

#[async_trait]
impl<S, A> TypeFetcher for FetchingStore<S, A>
where
    A: ToSocketAddrs + Send + Sync,
    S: DataTypeStore + PropertyTypeStore + EntityTypeStore + Send + Sync,
{
    #[tracing::instrument(level = "debug", skip(self, authorization_api))]
    async fn insert_external_ontology_type<Au: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut Au,
        temporal_client: Option<&TemporalClient>,
        reference: OntologyTypeReference<'_>,
    ) -> Result<OntologyTypeMetadata, InsertionError> {
        self.insert_external_types_by_reference(
            actor_id,
            authorization_api,
            temporal_client,
            reference,
            ConflictBehavior::Fail,
            FetchBehavior::IncludeProvidedReferences,
            &HashSet::new(),
        )
        .await?
        .into_iter()
        .find(|metadata| {
            let record_id = metadata.record_id();
            let reference = reference.url();
            record_id.base_url == reference.base_url
                && record_id.version.inner() == reference.version
        })
        .ok_or_else(|| {
            Report::new(InsertionError).attach_printable(format!(
                "external type was not fetched: {}",
                reference.url()
            ))
        })
    }
}

impl<I, A, R, S> ReadPaginated<R, S> for FetchingStore<I, A>
where
    A: Send + Sync,
    I: ReadPaginated<R, S> + Send,
    R: QueryRecord,
    S: Sorting + Sync,
{
    type QueryResult = I::QueryResult;
    type ReadPaginatedStream = I::ReadPaginatedStream;

    async fn read_paginated(
        &self,
        filter: &Filter<'_, R>,
        temporal_axes: Option<&QueryTemporalAxes>,
        sorting: &S,
        limit: Option<usize>,
        include_drafts: bool,
    ) -> Result<
        (
            Self::ReadPaginatedStream,
            <Self::QueryResult as QueryResult<R, S>>::Artifacts,
        ),
        QueryError,
    > {
        self.store
            .read_paginated(filter, temporal_axes, sorting, limit, include_drafts)
            .await
    }
}

#[async_trait]
impl<S, A, R> Read<R> for FetchingStore<S, A>
where
    A: Send + Sync,
    S: Read<R> + Send,
    R: QueryRecord,
{
    type ReadStream = S::ReadStream;

    async fn read(
        &self,
        filter: &Filter<'_, R>,
        temporal_axes: Option<&QueryTemporalAxes>,
        include_drafts: bool,
    ) -> Result<Self::ReadStream, QueryError> {
        self.store.read(filter, temporal_axes, include_drafts).await
    }

    async fn read_one(
        &self,
        filter: &Filter<'_, R>,
        temporal_axes: Option<&QueryTemporalAxes>,
        include_drafts: bool,
    ) -> Result<R, QueryError> {
        self.store
            .read_one(filter, temporal_axes, include_drafts)
            .await
    }
}

#[async_trait]
impl<S, A> AccountStore for FetchingStore<S, A>
where
    S: AccountStore + Send + Sync,
    A: Send + Sync,
{
    async fn insert_account_id<Au: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut Au,
        params: InsertAccountIdParams,
    ) -> Result<(), InsertionError> {
        self.store
            .insert_account_id(actor_id, authorization_api, params)
            .await
    }

    async fn insert_account_group_id<Au: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut Au,
        params: InsertAccountGroupIdParams,
    ) -> Result<(), InsertionError> {
        self.store
            .insert_account_group_id(actor_id, authorization_api, params)
            .await
    }

    async fn insert_web_id<Au: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut Au,
        params: InsertWebIdParams,
    ) -> Result<(), InsertionError> {
        self.store
            .insert_web_id(actor_id, authorization_api, params)
            .await
    }

    async fn identify_owned_by_id(
        &self,
        owned_by_id: OwnedById,
    ) -> Result<WebOwnerSubject, QueryError> {
        self.store.identify_owned_by_id(owned_by_id).await
    }
}

impl<S, A> DataTypeStore for FetchingStore<S, A>
where
    S: DataTypeStore + PropertyTypeStore + EntityTypeStore + Send + Sync,
    A: ToSocketAddrs + Send + Sync,
{
    async fn create_data_types<Au: AuthorizationApi + Send + Sync, P, R>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut Au,
        temporal_client: Option<&TemporalClient>,
        params: P,
    ) -> Result<Vec<DataTypeMetadata>, InsertionError>
    where
        P: IntoIterator<Item = CreateDataTypeParams<R>> + Send,
        R: IntoIterator<Item = DataTypeRelationAndSubject> + Send + Sync,
    {
        let creation_parameters = params.into_iter().collect::<Vec<_>>();
        let requested_types = creation_parameters
            .iter()
            .map(|parameters| parameters.schema.id())
            .collect::<HashSet<_>>();

        self.insert_external_types(
            actor_id,
            authorization_api,
            temporal_client,
            creation_parameters
                .iter()
                .map(|parameters| &parameters.schema),
            &requested_types,
        )
        .await
        .attach_printable_lazy(|| {
            requested_types
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join(", ")
        })?;

        self.store
            .create_data_types(
                actor_id,
                authorization_api,
                temporal_client,
                creation_parameters,
            )
            .await
    }

    async fn get_data_type<Au: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &Au,
        params: GetDataTypesParams<'_>,
    ) -> Result<Subgraph, QueryError> {
        self.store
            .get_data_type(actor_id, authorization_api, params)
            .await
    }

    async fn update_data_type<Au: AuthorizationApi + Send + Sync, R>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut Au,
        temporal_client: Option<&TemporalClient>,
        params: UpdateDataTypesParams<R>,
    ) -> Result<DataTypeMetadata, UpdateError>
    where
        R: IntoIterator<Item = DataTypeRelationAndSubject> + Send + Sync,
    {
        self.insert_external_types(
            actor_id,
            authorization_api,
            temporal_client,
            [&params.schema],
            &HashSet::from([params.schema.id()]),
        )
        .await
        .change_context(UpdateError)
        .attach_printable_lazy(|| params.schema.id().clone())?;

        self.store
            .update_data_type(actor_id, authorization_api, temporal_client, params)
            .await
    }

    async fn archive_data_type<Au: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut Au,
        params: ArchiveDataTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.store
            .archive_data_type(actor_id, authorization_api, params)
            .await
    }

    async fn unarchive_data_type<Au: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut Au,
        params: UnarchiveDataTypeParams,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.store
            .unarchive_data_type(actor_id, authorization_api, params)
            .await
    }

    async fn update_data_type_embeddings<Au: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut Au,
        params: UpdateDataTypeEmbeddingParams<'_>,
    ) -> Result<(), UpdateError> {
        self.store
            .update_data_type_embeddings(actor_id, authorization_api, params)
            .await
    }
}

impl<S, A> PropertyTypeStore for FetchingStore<S, A>
where
    S: DataTypeStore + PropertyTypeStore + EntityTypeStore + Send + Sync,
    A: ToSocketAddrs + Send + Sync,
{
    async fn create_property_types<Au: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut Au,
        temporal_client: Option<&TemporalClient>,
        property_types: impl IntoIterator<
            Item = (PropertyType, PartialPropertyTypeMetadata),
            IntoIter: Send,
        > + Send,
        on_conflict: ConflictBehavior,
        relationships: impl IntoIterator<Item = PropertyTypeRelationAndSubject> + Send,
    ) -> Result<Vec<PropertyTypeMetadata>, InsertionError> {
        let property_types = property_types.into_iter().collect::<Vec<_>>();
        let requested_types = property_types
            .iter()
            .map(|(property_type, _)| property_type.id())
            .collect::<HashSet<_>>();

        self.insert_external_types(
            actor_id,
            authorization_api,
            temporal_client,
            property_types
                .iter()
                .map(|(property_type, _)| property_type),
            &requested_types,
        )
        .await
        .attach_printable_lazy(|| {
            property_types
                .iter()
                .map(|(property_type, _)| property_type.id().to_string())
                .collect::<Vec<_>>()
                .join(", ")
        })?;

        self.store
            .create_property_types(
                actor_id,
                authorization_api,
                temporal_client,
                property_types,
                on_conflict,
                relationships,
            )
            .await
    }

    async fn get_property_type<Au: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &Au,
        query: &StructuralQuery<'_, PropertyTypeWithMetadata>,
        after: Option<PropertyTypeVertexId>,
        limit: Option<usize>,
    ) -> Result<Subgraph, QueryError> {
        self.store
            .get_property_type(actor_id, authorization_api, query, after, limit)
            .await
    }

    async fn update_property_type<Au: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut Au,
        temporal_client: Option<&TemporalClient>,
        property_type: PropertyType,
        relationships: impl IntoIterator<Item = PropertyTypeRelationAndSubject> + Send,
    ) -> Result<PropertyTypeMetadata, UpdateError> {
        self.insert_external_types(
            actor_id,
            authorization_api,
            temporal_client,
            [&property_type],
            &HashSet::from([property_type.id()]),
        )
        .await
        .change_context(UpdateError)
        .attach_printable_lazy(|| property_type.id().clone())?;

        self.store
            .update_property_type(
                actor_id,
                authorization_api,
                temporal_client,
                property_type,
                relationships,
            )
            .await
    }

    async fn archive_property_type<Au: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut Au,
        id: &VersionedUrl,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.store
            .archive_property_type(actor_id, authorization_api, id)
            .await
    }

    async fn unarchive_property_type<Au: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut Au,
        id: &VersionedUrl,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.store
            .unarchive_property_type(actor_id, authorization_api, id)
            .await
    }

    async fn update_property_type_embeddings<Au: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut Au,
        embeddings: Vec<PropertyTypeEmbedding<'_>>,
        updated_at_transaction_time: Timestamp<TransactionTime>,
        reset: bool,
    ) -> Result<(), UpdateError> {
        self.store
            .update_property_type_embeddings(
                actor_id,
                authorization_api,
                embeddings,
                updated_at_transaction_time,
                reset,
            )
            .await
    }
}

impl<S, A> EntityTypeStore for FetchingStore<S, A>
where
    S: DataTypeStore + PropertyTypeStore + EntityTypeStore + Send + Sync,
    A: ToSocketAddrs + Send + Sync,
{
    async fn create_entity_types<Au: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut Au,
        temporal_client: Option<&TemporalClient>,
        entity_types: impl IntoIterator<Item = (EntityType, PartialEntityTypeMetadata), IntoIter: Send>
        + Send,
        on_conflict: ConflictBehavior,
        relationships: impl IntoIterator<Item = EntityTypeRelationAndSubject> + Send,
    ) -> Result<Vec<EntityTypeMetadata>, InsertionError> {
        let entity_types = entity_types.into_iter().collect::<Vec<_>>();
        let requested_types = entity_types
            .iter()
            .map(|(entity_type, _)| entity_type.id())
            .collect::<HashSet<_>>();

        self.insert_external_types(
            actor_id,
            authorization_api,
            temporal_client,
            entity_types.iter().map(|(entity_type, _)| entity_type),
            &requested_types,
        )
        .await
        .attach_printable_lazy(|| {
            entity_types
                .iter()
                .map(|(entity_type, _)| entity_type.id().to_string())
                .collect::<Vec<_>>()
                .join(", ")
        })?;

        self.store
            .create_entity_types(
                actor_id,
                authorization_api,
                temporal_client,
                entity_types,
                on_conflict,
                relationships,
            )
            .await
    }

    async fn get_entity_type<Au: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &Au,
        query: &StructuralQuery<'_, EntityTypeWithMetadata>,
        cursor: Option<EntityTypeVertexId>,
        limit: Option<usize>,
    ) -> Result<Subgraph, QueryError> {
        self.store
            .get_entity_type(actor_id, authorization_api, query, cursor, limit)
            .await
    }

    async fn update_entity_type<Au: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut Au,
        temporal_client: Option<&TemporalClient>,
        entity_type: EntityType,
        label_property: Option<BaseUrl>,
        icon: Option<String>,
        relationships: impl IntoIterator<Item = EntityTypeRelationAndSubject> + Send,
    ) -> Result<EntityTypeMetadata, UpdateError> {
        self.insert_external_types(
            actor_id,
            authorization_api,
            temporal_client,
            [&entity_type],
            &HashSet::from([entity_type.id()]),
        )
        .await
        .change_context(UpdateError)
        .attach_printable_lazy(|| entity_type.id().clone())?;

        self.store
            .update_entity_type(
                actor_id,
                authorization_api,
                temporal_client,
                entity_type,
                label_property,
                icon,
                relationships,
            )
            .await
    }

    async fn archive_entity_type<Au: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut Au,
        id: &VersionedUrl,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.store
            .archive_entity_type(actor_id, authorization_api, id)
            .await
    }

    async fn unarchive_entity_type<Au: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut Au,
        id: &VersionedUrl,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.store
            .unarchive_entity_type(actor_id, authorization_api, id)
            .await
    }

    async fn update_entity_type_embeddings<Au: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut Au,
        embeddings: Vec<EntityTypeEmbedding<'_>>,
        updated_at_transaction_time: Timestamp<TransactionTime>,
        reset: bool,
    ) -> Result<(), UpdateError> {
        self.store
            .update_entity_type_embeddings(
                actor_id,
                authorization_api,
                embeddings,
                updated_at_transaction_time,
                reset,
            )
            .await
    }
}

impl<S, A> EntityStore for FetchingStore<S, A>
where
    S: DataTypeStore + PropertyTypeStore + EntityTypeStore + EntityStore + Send + Sync,
    A: ToSocketAddrs + Send + Sync,
{
    async fn create_entity<Au: AuthorizationApi + Send + Sync, R>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut Au,
        temporal_client: Option<&TemporalClient>,
        params: CreateEntityParams<R>,
    ) -> Result<EntityMetadata, InsertionError>
    where
        R: IntoIterator<Item = EntityRelationAndSubject> + Send,
    {
        let entity_type_reference = EntityTypeReference::new(params.entity_type_id.clone());
        self.insert_external_types_by_reference(
            actor_id,
            authorization_api,
            temporal_client,
            OntologyTypeReference::EntityTypeReference(&entity_type_reference),
            ConflictBehavior::Skip,
            FetchBehavior::ExcludeProvidedReferences,
            &HashSet::new(),
        )
        .await?;

        self.store
            .create_entity(actor_id, authorization_api, temporal_client, params)
            .await
    }

    #[tracing::instrument(level = "info", skip(self, authorization_api, params))]
    async fn validate_entity<Au: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &Au,
        consistency: Consistency<'_>,
        params: ValidateEntityParams<'_>,
    ) -> Result<(), ValidateEntityError> {
        self.store
            .validate_entity(actor_id, authorization_api, consistency, params)
            .await
    }

    async fn insert_entities_batched_by_type<Au: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut Au,
        entities: impl IntoIterator<
            Item = (
                OwnedById,
                Option<EntityUuid>,
                EntityProperties,
                Option<LinkData>,
                Option<Timestamp<DecisionTime>>,
            ),
            IntoIter: Send,
        > + Send,
        entity_type_id: &VersionedUrl,
    ) -> Result<Vec<EntityMetadata>, InsertionError> {
        let entity_type_reference = EntityTypeReference::new(entity_type_id.clone());
        self.insert_external_types_by_reference(
            actor_id,
            authorization_api,
            None,
            OntologyTypeReference::EntityTypeReference(&entity_type_reference),
            ConflictBehavior::Skip,
            FetchBehavior::ExcludeProvidedReferences,
            &HashSet::new(),
        )
        .await?;

        self.store
            .insert_entities_batched_by_type(actor_id, authorization_api, entities, entity_type_id)
            .await
    }

    async fn get_entity<Au: AuthorizationApi + Sync>(
        &self,
        actor_id: AccountId,
        authorization_api: &Au,
        params: GetEntityParams<'_>,
    ) -> Result<(Subgraph, Option<EntityQueryCursor<'static>>), QueryError> {
        self.store
            .get_entity(actor_id, authorization_api, params)
            .await
    }

    async fn update_entity<Au: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut Au,
        temporal_client: Option<&TemporalClient>,
        params: UpdateEntityParams,
    ) -> Result<EntityMetadata, UpdateError> {
        let entity_type_reference = EntityTypeReference::new(params.entity_type_id.clone());
        self.insert_external_types_by_reference(
            actor_id,
            authorization_api,
            temporal_client,
            OntologyTypeReference::EntityTypeReference(&entity_type_reference),
            ConflictBehavior::Skip,
            FetchBehavior::ExcludeProvidedReferences,
            &HashSet::new(),
        )
        .await
        .change_context(UpdateError)?;

        self.store
            .update_entity(actor_id, authorization_api, temporal_client, params)
            .await
    }

    async fn update_entity_embeddings<Au: AuthorizationApi + Send + Sync>(
        &mut self,
        actor_id: AccountId,
        authorization_api: &mut Au,
        embeddings: Vec<EntityEmbedding<'_>>,
        updated_at_transaction_time: Timestamp<TransactionTime>,
        updated_at_decision_time: Timestamp<DecisionTime>,
        reset: bool,
    ) -> Result<(), UpdateError> {
        self.store
            .update_entity_embeddings(
                actor_id,
                authorization_api,
                embeddings,
                updated_at_transaction_time,
                updated_at_decision_time,
                reset,
            )
            .await
    }
}
