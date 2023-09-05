use std::{
    collections::{HashMap, HashSet},
    future::Future,
    iter::once,
    mem,
};

use async_trait::async_trait;
use error_stack::{Report, Result, ResultExt};
use graph_types::{
    account::AccountId,
    knowledge::{
        entity::{Entity, EntityId, EntityMetadata, EntityProperties, EntityUuid},
        link::{EntityLinkOrder, LinkData},
    },
    ontology::{
        DataTypeWithMetadata, EntityTypeMetadata, EntityTypeWithMetadata, OntologyElementMetadata,
        OntologyTemporalMetadata, OntologyType, OntologyTypeReference, OntologyTypeVersion,
        PartialCustomEntityTypeMetadata, PartialCustomOntologyMetadata, PartialEntityTypeMetadata,
        PartialOntologyElementMetadata, PropertyTypeWithMetadata,
    },
    provenance::{OwnedById, ProvenanceMetadata, RecordArchivedById, RecordCreatedById},
};
use tarpc::context;
use temporal_versioning::{DecisionTime, Timestamp};
use tokio::net::ToSocketAddrs;
use tokio_serde::formats::Json;
use type_fetcher::fetcher::{FetcherClient, OntologyTypeRepr};
use type_system::{
    url::{BaseUrl, VersionedUrl},
    DataType, EntityType, EntityTypeReference, PropertyType,
};

use crate::{
    ontology::domain_validator::DomainValidator,
    store::{
        crud::Read,
        query::{Filter, OntologyQueryPath},
        AccountStore, ConflictBehavior, DataTypeStore, EntityStore, EntityTypeStore,
        InsertionError, PropertyTypeStore, QueryError, Record, StoreError, StorePool, UpdateError,
    },
    subgraph::{
        edges::GraphResolveDepths,
        identifier::VertexId,
        query::StructuralQuery,
        temporal_axes::{
            PinnedTemporalAxisUnresolved, QueryTemporalAxes, QueryTemporalAxesUnresolved,
            VariableTemporalAxisUnresolved,
        },
        Subgraph,
    },
};

pub trait TypeFetcher {
    /// Fetches the provided type reference and inserts it to the Graph.
    fn insert_external_ontology_type(
        &mut self,
        reference: OntologyTypeReference<'_>,
        actor_id: RecordCreatedById,
    ) -> impl Future<Output = Result<OntologyElementMetadata, InsertionError>> + Send;
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

impl<S, A> FetchingStore<S, A>
where
    S: Send + Sync,
    A: ToSocketAddrs + Send + Sync,
{
    fn connection_info(&self) -> Result<&TypeFetcherConnectionInfo<A>, StoreError> {
        self.connection_info.as_ref().ok_or_else(|| {
            Report::new(StoreError)
                .attach_printable("type fetcher is not available in offline mode")
        })
    }

    pub async fn fetcher_client(&self) -> Result<FetcherClient, StoreError>
    where
        A: ToSocketAddrs,
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
struct FetchedOntologyTypes {
    data_types: Vec<(DataType, PartialOntologyElementMetadata)>,
    property_types: Vec<(PropertyType, PartialOntologyElementMetadata)>,
    entity_types: Vec<(EntityType, PartialEntityTypeMetadata)>,
}

enum FetchBehavior {
    IncludeProvidedReferences,
    ExcludeProvidedReferences,
}

impl<'t, S, A> FetchingStore<S, A>
where
    A: ToSocketAddrs + Send + Sync,
    S: DataTypeStore + PropertyTypeStore + EntityTypeStore + Send,
{
    async fn contains_ontology_type(
        &self,
        ontology_type_reference: OntologyTypeReference<'_>,
    ) -> Result<bool, StoreError>
    where
        S: DataTypeStore + PropertyTypeStore + EntityTypeStore + Send,
        A: Send + Sync,
    {
        fn create_query<'u, T>(versioned_url: &'u VersionedUrl) -> StructuralQuery<'u, T>
        where
            T: Record<QueryPath<'u>: OntologyQueryPath>,
            T::VertexId: VertexId<BaseId = BaseUrl, RevisionId = OntologyTypeVersion>,
        {
            StructuralQuery {
                filter: Filter::for_versioned_url(versioned_url),
                graph_resolve_depths: GraphResolveDepths::default(),
                temporal_axes: QueryTemporalAxesUnresolved::DecisionTime {
                    pinned: PinnedTemporalAxisUnresolved::new(None),
                    variable: VariableTemporalAxisUnresolved::new(None, None),
                },
            }
        }

        let url = match ontology_type_reference {
            OntologyTypeReference::DataTypeReference(reference) => reference.url(),
            OntologyTypeReference::PropertyTypeReference(reference) => reference.url(),
            OntologyTypeReference::EntityTypeReference(reference) => reference.url(),
        };

        if self
            .connection_info()?
            .domain_validator
            .validate_url(url.base_url.as_str())
        {
            // If the domain is valid, we own the data type and it either exists or we cannot
            // reference it.
            return Ok(true);
        }

        match ontology_type_reference {
            OntologyTypeReference::DataTypeReference(_) => {
                self.store.get_data_type(&create_query(url)).await
            }
            OntologyTypeReference::PropertyTypeReference(_) => {
                self.store.get_property_type(&create_query(url)).await
            }
            OntologyTypeReference::EntityTypeReference(_) => {
                self.store.get_entity_type(&create_query(url)).await
            }
        }
        .change_context(StoreError)
        .attach_printable("Could not check if ontology type exists")
        .map(|subgraph| !subgraph.roots.is_empty())
    }

    async fn collect_external_ontology_types<'o, T: OntologyType + Sync>(
        &self,
        ontology_type: &'o T,
    ) -> Result<Vec<OntologyTypeReference<'o>>, QueryError> {
        let mut references = Vec::new();
        for reference in ontology_type.traverse_references() {
            if !self
                .contains_ontology_type(reference)
                .await
                .change_context(QueryError)?
            {
                references.push(reference);
            }
        }

        Ok(references)
    }

    #[expect(
        clippy::too_many_lines,
        reason = "Large parts of this function is is written out three times and this should be \
                  moved to another function at some point."
    )]
    async fn fetch_external_ontology_types(
        &self,
        ontology_type_references: Vec<VersionedUrl>,
        actor_id: RecordCreatedById,
        fetch_behavior: FetchBehavior,
    ) -> Result<FetchedOntologyTypes, StoreError> {
        let provenance_metadata = ProvenanceMetadata {
            record_created_by_id: actor_id,
            record_archived_by_id: None,
        };

        let mut queue = ontology_type_references;
        let mut seen = match fetch_behavior {
            FetchBehavior::IncludeProvidedReferences => HashSet::new(),
            FetchBehavior::ExcludeProvidedReferences => {
                queue.iter().cloned().collect::<HashSet<_>>()
            }
        };

        let mut fetched_ontology_types = FetchedOntologyTypes::default();

        let fetcher = self.fetcher_client().await.change_context(StoreError)?;
        loop {
            let ontology_urls = mem::take(&mut queue);
            if ontology_urls.is_empty() {
                break;
            }

            let ontology_types = fetcher
                .fetch_ontology_types(context::current(), ontology_urls)
                .await
                .change_context(StoreError)?
                .change_context(StoreError)?;

            for (ontology_type, fetched_at) in ontology_types {
                match ontology_type {
                    OntologyTypeRepr::DataType(data_type_repr) => {
                        let data_type =
                            DataType::try_from(data_type_repr).change_context(StoreError)?;
                        let metadata = PartialOntologyElementMetadata {
                            record_id: data_type.id().clone().into(),
                            custom: PartialCustomOntologyMetadata::External {
                                provenance: provenance_metadata,
                                fetched_at,
                            },
                        };

                        for referenced_ontology_type in self
                            .collect_external_ontology_types(&data_type)
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
                    OntologyTypeRepr::PropertyType(property_type) => {
                        let property_type =
                            PropertyType::try_from(property_type).change_context(StoreError)?;
                        let metadata = PartialOntologyElementMetadata {
                            record_id: property_type.id().clone().into(),
                            custom: PartialCustomOntologyMetadata::External {
                                provenance: provenance_metadata,
                                fetched_at,
                            },
                        };

                        for referenced_ontology_type in self
                            .collect_external_ontology_types(&property_type)
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
                    OntologyTypeRepr::EntityType(entity_type) => {
                        let entity_type =
                            EntityType::try_from(entity_type).change_context(StoreError)?;
                        let metadata = PartialOntologyElementMetadata {
                            record_id: entity_type.id().clone().into(),
                            custom: PartialCustomOntologyMetadata::External {
                                provenance: provenance_metadata,
                                fetched_at,
                            },
                        };

                        for referenced_ontology_type in self
                            .collect_external_ontology_types(&entity_type)
                            .await
                            .change_context(StoreError)?
                        {
                            if !seen.contains(referenced_ontology_type.url()) {
                                queue.push(referenced_ontology_type.url().clone());
                                seen.insert(referenced_ontology_type.url().clone());
                            }
                        }

                        fetched_ontology_types.entity_types.push((
                            entity_type,
                            PartialEntityTypeMetadata {
                                record_id: metadata.record_id,
                                custom: PartialCustomEntityTypeMetadata {
                                    common: metadata.custom,
                                    label_property: None,
                                },
                            },
                        ));
                    }
                }
            }
        }

        Ok(fetched_ontology_types)
    }

    async fn insert_external_types<'o, T: OntologyType + Sync + 'o>(
        &mut self,
        ontology_types: impl IntoIterator<Item = (&'o T, RecordCreatedById), IntoIter: Send> + Send,
    ) -> Result<(), InsertionError> {
        // Without collecting it first, we get a "Higher-ranked lifetime error" because of the
        // limitations of Rust being able to look into a `Pin<Box<dyn Future>>`, which is returned
        // by `#[async_trait]` methods.
        let ontology_types = ontology_types.into_iter().collect::<Vec<_>>();

        let mut partitioned_ontology_types = HashMap::<RecordCreatedById, Vec<VersionedUrl>>::new();

        for (ontology_type, actor_id) in ontology_types {
            let external_types = self
                .collect_external_ontology_types(ontology_type)
                .await
                .change_context(InsertionError)?;

            if !external_types.is_empty() {
                partitioned_ontology_types
                    .entry(actor_id)
                    .or_default()
                    .extend(
                        external_types
                            .into_iter()
                            .map(|ontology_type| ontology_type.url().clone()),
                    );
            }
        }

        for (actor_id, ontology_types_to_fetch) in partitioned_ontology_types {
            let fetched_ontology_types = self
                .fetch_external_ontology_types(
                    ontology_types_to_fetch,
                    actor_id,
                    FetchBehavior::ExcludeProvidedReferences,
                )
                .await
                .change_context(InsertionError)?;

            self.store
                .create_data_types(fetched_ontology_types.data_types, ConflictBehavior::Skip)
                .await?;
            self.store
                .create_property_types(
                    fetched_ontology_types.property_types,
                    ConflictBehavior::Skip,
                )
                .await?;
            self.store
                .create_entity_types(fetched_ontology_types.entity_types, ConflictBehavior::Skip)
                .await?;
        }

        Ok(())
    }

    async fn insert_external_types_by_reference(
        &mut self,
        reference: OntologyTypeReference<'_>,
        actor_id: RecordCreatedById,
        on_conflict: ConflictBehavior,
        fetch_behavior: FetchBehavior,
    ) -> Result<Vec<OntologyElementMetadata>, InsertionError> {
        if on_conflict == ConflictBehavior::Fail
            || !self
                .contains_ontology_type(reference)
                .await
                .change_context(InsertionError)?
        {
            let fetched_ontology_types = self
                .fetch_external_ontology_types(
                    vec![reference.url().clone()],
                    actor_id,
                    fetch_behavior,
                )
                .await
                .change_context(InsertionError)?;

            let created_data_types = self
                .store
                .create_data_types(fetched_ontology_types.data_types, ConflictBehavior::Skip)
                .await?;
            let created_property_types = self
                .store
                .create_property_types(
                    fetched_ontology_types.property_types,
                    ConflictBehavior::Skip,
                )
                .await?;
            let created_entity_types = self
                .store
                .create_entity_types(fetched_ontology_types.entity_types, ConflictBehavior::Skip)
                .await?;

            Ok(created_data_types
                .into_iter()
                .chain(created_property_types)
                .chain(
                    created_entity_types
                        .into_iter()
                        .map(OntologyElementMetadata::from),
                )
                .collect())
        } else {
            Ok(Vec::new())
        }
    }
}

impl<S, A> TypeFetcher for FetchingStore<S, A>
where
    A: ToSocketAddrs + Send + Sync,
    S: DataTypeStore + PropertyTypeStore + EntityTypeStore + Send,
{
    async fn insert_external_ontology_type(
        &mut self,
        reference: OntologyTypeReference<'_>,
        actor_id: RecordCreatedById,
    ) -> Result<OntologyElementMetadata, InsertionError> {
        self.insert_external_types_by_reference(
            reference,
            actor_id,
            ConflictBehavior::Fail,
            FetchBehavior::IncludeProvidedReferences,
        )
        .await?
        .into_iter()
        .find(|metadata| {
            metadata.record_id.base_url == reference.url().base_url
                && metadata.record_id.version.inner() == reference.url().version
        })
        .ok_or_else(|| {
            Report::new(InsertionError).attach_printable(format!(
                "external type was not fetched: {}",
                reference.url()
            ))
        })
    }
}

#[async_trait]
impl<S, A, R: Record> Read<R> for FetchingStore<S, A>
where
    A: Send + Sync,
    S: Read<R> + Send,
{
    type ReadStream = S::ReadStream;
    type Record = S::Record;

    async fn read(
        &self,
        query: &Filter<Self::Record>,
        temporal_axes: Option<&QueryTemporalAxes>,
    ) -> Result<Self::ReadStream, QueryError> {
        self.store.read(query, temporal_axes).await
    }
}

impl<S, A> AccountStore for FetchingStore<S, A>
where
    S: AccountStore + Send,
    A: Send + Sync,
{
    async fn insert_account_id(&mut self, account_id: AccountId) -> Result<(), InsertionError> {
        self.store.insert_account_id(account_id).await
    }
}

#[async_trait]
impl<S, A> DataTypeStore for FetchingStore<S, A>
where
    S: DataTypeStore + PropertyTypeStore + EntityTypeStore + Send,
    A: ToSocketAddrs + Send + Sync,
{
    async fn create_data_types(
        &mut self,
        data_types: impl IntoIterator<Item = (DataType, PartialOntologyElementMetadata), IntoIter: Send>
        + Send,
        on_conflict: ConflictBehavior,
    ) -> Result<Vec<OntologyElementMetadata>, InsertionError> {
        let data_types = data_types.into_iter().collect::<Vec<_>>();

        self.insert_external_types(data_types.iter().map(|(data_type, metadata)| {
            (data_type, metadata.custom.provenance().record_created_by_id)
        }))
        .await?;

        self.store.create_data_types(data_types, on_conflict).await
    }

    async fn get_data_type(
        &self,
        query: &StructuralQuery<DataTypeWithMetadata>,
    ) -> Result<Subgraph, QueryError> {
        self.store.get_data_type(query).await
    }

    async fn update_data_type(
        &mut self,
        data_type: DataType,
        actor_id: RecordCreatedById,
    ) -> Result<OntologyElementMetadata, UpdateError> {
        self.insert_external_types(once((&data_type, actor_id)))
            .await
            .change_context(UpdateError)?;

        self.store.update_data_type(data_type, actor_id).await
    }

    async fn archive_data_type(
        &mut self,
        id: &VersionedUrl,
        actor_id: RecordArchivedById,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.store.archive_data_type(id, actor_id).await
    }

    async fn unarchive_data_type(
        &mut self,
        id: &VersionedUrl,
        actor_id: RecordCreatedById,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.store.unarchive_data_type(id, actor_id).await
    }
}

#[async_trait]
impl<S, A> PropertyTypeStore for FetchingStore<S, A>
where
    S: DataTypeStore + PropertyTypeStore + EntityTypeStore + Send,
    A: ToSocketAddrs + Send + Sync,
{
    async fn create_property_types(
        &mut self,
        property_types: impl IntoIterator<
            Item = (PropertyType, PartialOntologyElementMetadata),
            IntoIter: Send,
        > + Send,
        on_conflict: ConflictBehavior,
    ) -> Result<Vec<OntologyElementMetadata>, InsertionError> {
        let property_types = property_types.into_iter().collect::<Vec<_>>();

        self.insert_external_types(property_types.iter().map(|(property_type, metadata)| {
            (
                property_type,
                metadata.custom.provenance().record_created_by_id,
            )
        }))
        .await?;

        self.store
            .create_property_types(property_types, on_conflict)
            .await
    }

    async fn get_property_type(
        &self,
        query: &StructuralQuery<PropertyTypeWithMetadata>,
    ) -> Result<Subgraph, QueryError> {
        self.store.get_property_type(query).await
    }

    async fn update_property_type(
        &mut self,
        property_type: PropertyType,
        actor_id: RecordCreatedById,
    ) -> Result<OntologyElementMetadata, UpdateError> {
        self.insert_external_types(once((&property_type, actor_id)))
            .await
            .change_context(UpdateError)?;

        self.store
            .update_property_type(property_type, actor_id)
            .await
    }

    async fn archive_property_type(
        &mut self,
        id: &VersionedUrl,
        actor_id: RecordArchivedById,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.store.archive_property_type(id, actor_id).await
    }

    async fn unarchive_property_type(
        &mut self,
        id: &VersionedUrl,
        actor_id: RecordCreatedById,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.store.unarchive_property_type(id, actor_id).await
    }
}

impl<S, A> EntityTypeStore for FetchingStore<S, A>
where
    S: DataTypeStore + PropertyTypeStore + EntityTypeStore + Send,
    A: ToSocketAddrs + Send + Sync,
{
    async fn create_entity_types(
        &mut self,
        entity_types: impl IntoIterator<Item = (EntityType, PartialEntityTypeMetadata), IntoIter: Send>
        + Send,
        on_conflict: ConflictBehavior,
    ) -> Result<Vec<EntityTypeMetadata>, InsertionError> {
        let entity_types = entity_types.into_iter().collect::<Vec<_>>();

        self.insert_external_types(entity_types.iter().map(|(entity_type, metadata)| {
            (
                entity_type,
                metadata.custom.common.provenance().record_created_by_id,
            )
        }))
        .await?;

        self.store
            .create_entity_types(entity_types, on_conflict)
            .await
    }

    async fn get_entity_type(
        &self,
        query: &StructuralQuery<'_, EntityTypeWithMetadata>,
    ) -> Result<Subgraph, QueryError> {
        self.store.get_entity_type(query).await
    }

    async fn update_entity_type(
        &mut self,
        entity_type: EntityType,
        actor_id: RecordCreatedById,
        label_property: Option<BaseUrl>,
    ) -> Result<EntityTypeMetadata, UpdateError> {
        self.insert_external_types(once((&entity_type, actor_id)))
            .await
            .change_context(UpdateError)?;

        self.store
            .update_entity_type(entity_type, actor_id, label_property)
            .await
    }

    async fn archive_entity_type(
        &mut self,
        id: &VersionedUrl,
        actor_id: RecordArchivedById,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.store.archive_entity_type(id, actor_id).await
    }

    async fn unarchive_entity_type(
        &mut self,
        id: &VersionedUrl,
        actor_id: RecordCreatedById,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.store.unarchive_entity_type(id, actor_id).await
    }
}

impl<S, A> EntityStore for FetchingStore<S, A>
where
    S: DataTypeStore + PropertyTypeStore + EntityTypeStore + EntityStore + Send,
    A: ToSocketAddrs + Send + Sync,
{
    async fn create_entity(
        &mut self,
        owned_by_id: OwnedById,
        entity_uuid: Option<EntityUuid>,
        decision_time: Option<Timestamp<DecisionTime>>,
        record_created_by_id: RecordCreatedById,
        archived: bool,
        entity_type_id: VersionedUrl,
        properties: EntityProperties,
        link_data: Option<LinkData>,
    ) -> Result<EntityMetadata, InsertionError> {
        let entity_type_reference = EntityTypeReference::new(entity_type_id.clone());
        self.insert_external_types_by_reference(
            OntologyTypeReference::EntityTypeReference(&entity_type_reference),
            record_created_by_id,
            ConflictBehavior::Skip,
            FetchBehavior::ExcludeProvidedReferences,
        )
        .await?;

        self.store
            .create_entity(
                owned_by_id,
                entity_uuid,
                decision_time,
                record_created_by_id,
                archived,
                entity_type_id,
                properties,
                link_data,
            )
            .await
    }

    #[doc(hidden)]
    #[cfg(hash_graph_test_environment)]
    async fn insert_entities_batched_by_type(
        &mut self,
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
        actor_id: RecordCreatedById,
        entity_type_id: &VersionedUrl,
    ) -> Result<Vec<EntityMetadata>, InsertionError> {
        let entity_type_reference = EntityTypeReference::new(entity_type_id.clone());
        self.insert_external_types_by_reference(
            OntologyTypeReference::EntityTypeReference(&entity_type_reference),
            actor_id,
            ConflictBehavior::Skip,
            FetchBehavior::ExcludeProvidedReferences,
        )
        .await?;

        self.store
            .insert_entities_batched_by_type(entities, actor_id, entity_type_id)
            .await
    }

    async fn get_entity(
        &self,
        query: &StructuralQuery<'_, Entity>,
    ) -> Result<Subgraph, QueryError> {
        self.store.get_entity(query).await
    }

    async fn update_entity(
        &mut self,
        entity_id: EntityId,
        decision_time: Option<Timestamp<DecisionTime>>,
        record_created_by_id: RecordCreatedById,
        archived: bool,
        entity_type_id: VersionedUrl,
        properties: EntityProperties,
        link_order: EntityLinkOrder,
    ) -> Result<EntityMetadata, UpdateError> {
        let entity_type_reference = EntityTypeReference::new(entity_type_id.clone());
        self.insert_external_types_by_reference(
            OntologyTypeReference::EntityTypeReference(&entity_type_reference),
            record_created_by_id,
            ConflictBehavior::Skip,
            FetchBehavior::ExcludeProvidedReferences,
        )
        .await
        .change_context(UpdateError)?;

        self.store
            .update_entity(
                entity_id,
                decision_time,
                record_created_by_id,
                archived,
                entity_type_id,
                properties,
                link_order,
            )
            .await
    }
}
