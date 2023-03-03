use std::{borrow::Borrow, iter::once};

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use tarpc::context;
use tokio::net::ToSocketAddrs;
#[cfg(feature = "type-fetcher")]
use tokio_serde::formats::MessagePack;
#[cfg(feature = "type-fetcher")]
use type_fetcher::fetcher::FetcherClient;
use type_fetcher::{fetcher::OntologyType, fetcher_server::OntologyTypeReference};
use type_system::{
    url::VersionedUrl, DataType, DataTypeReference, EntityType, EntityTypeReference, PropertyType,
    PropertyTypeReference,
};

use crate::{
    identifier::{
        account::AccountId,
        knowledge::EntityId,
        time::{DecisionTime, Timestamp},
    },
    knowledge::{Entity, EntityLinkOrder, EntityMetadata, EntityProperties, EntityUuid, LinkData},
    ontology::{
        domain_validator::DomainValidator, DataTypeWithMetadata, EntityTypeWithMetadata,
        ExternalOntologyElementMetadata, OntologyElementMetadata, PropertyTypeWithMetadata,
    },
    provenance::{OwnedById, ProvenanceMetadata, UpdatedById},
    store::{
        crud::Read,
        query::{Filter, OntologyQueryPath},
        AccountStore, DataTypeStore, EntityStore, EntityTypeStore, InsertionError,
        PropertyTypeStore, QueryError, Record, StoreError, StorePool, UpdateError,
    },
    subgraph::{
        edges::GraphResolveDepths,
        query::StructuralQuery,
        temporal_axes::{
            PinnedTemporalAxisUnresolved, QueryTemporalAxes, QueryTemporalAxesUnresolved,
            VariableTemporalAxisUnresolved,
        },
        Subgraph,
    },
};

pub struct FetchingPool<P, A> {
    pool: P,
    address: A,
    config: tarpc::client::Config,
    domain_validator: DomainValidator,
}

impl<P, A> FetchingPool<P, A>
where
    A: ToSocketAddrs,
{
    pub fn new(pool: P, address: A, domain_validator: DomainValidator) -> Self {
        Self {
            pool,
            address,
            config: tarpc::client::Config::default(),
            domain_validator,
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
            address: self.address.clone(),
            config: self.config.clone(),
            domain_validator: self.domain_validator.clone(),
        })
    }

    async fn acquire_owned(&self) -> Result<Self::Store<'static>, Self::Error> {
        Ok(FetchingStore {
            store: self.pool.acquire_owned().await?,
            address: self.address.clone(),
            config: self.config.clone(),
            domain_validator: self.domain_validator.clone(),
        })
    }
}

pub struct FetchingStore<S, A> {
    store: S,
    address: A,
    config: tarpc::client::Config,
    domain_validator: DomainValidator,
}

impl<S, A> FetchingStore<S, A>
where
    S: Send + Sync,
    A: ToSocketAddrs + Send + Sync,
{
    pub async fn fetcher_client(&self) -> Result<FetcherClient, StoreError>
    where
        A: ToSocketAddrs,
    {
        let transport = tarpc::serde_transport::tcp::connect(&self.address, MessagePack::default)
            .await
            .into_report()
            .change_context(StoreError)
            .attach_printable("Could not connect to type fetcher")?;
        Ok(FetcherClient::new(self.config.clone(), transport).spawn())
    }

    pub fn store(&mut self) -> &mut S {
        &mut self.store
    }
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

        if self.domain_validator.validate_url(url.base_url.as_str()) {
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

    async fn collect_external_ontology_types<'o, T: crate::ontology::OntologyType + Sync>(
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

    async fn fetch_external_ontology_types(
        &self,
        ontology_type_references: impl IntoIterator<
            Item = (OntologyTypeReference<'_>, UpdatedById),
            IntoIter: Send,
        > + Send,
    ) -> Result<
        (
            Vec<(DataType, OntologyElementMetadata)>,
            Vec<(PropertyType, OntologyElementMetadata)>,
            Vec<(EntityType, OntologyElementMetadata)>,
        ),
        StoreError,
    > {
        let fetcher_client = self.fetcher_client().await?;

        let mut data_types = Vec::new();
        let mut property_types = Vec::new();
        let mut entity_types = Vec::new();

        for (reference, fetched_by) in ontology_type_references {
            let provenance_metadata = ProvenanceMetadata::new(fetched_by);
            let fetched_ontology_types = fetcher_client
                .fetch_ontology_type_exhaustive(context::current(), reference.url().clone())
                .await
                .into_report()
                .change_context(StoreError)?
                .into_report()
                .change_context(StoreError)?;

            for fetched_ontology_type in fetched_ontology_types.results {
                match fetched_ontology_type.ontology_type {
                    OntologyType::DataType(data_type) => {
                        let data_type = DataType::try_from(data_type)
                            .into_report()
                            .change_context(StoreError)?;
                        let data_type_reference = DataTypeReference::new(data_type.id().clone());
                        if !self
                            .contains_ontology_type(OntologyTypeReference::DataTypeReference(
                                &data_type_reference,
                            ))
                            .await?
                        {
                            let metadata = ExternalOntologyElementMetadata::new(
                                data_type.id().clone().into(),
                                provenance_metadata,
                                fetched_ontology_type.fetched_at,
                            );

                            data_types
                                .push((data_type, OntologyElementMetadata::External(metadata)));
                        }
                    }
                    OntologyType::PropertyType(property_type) => {
                        let property_type = PropertyType::try_from(property_type)
                            .into_report()
                            .change_context(StoreError)?;
                        let property_type_reference =
                            PropertyTypeReference::new(property_type.id().clone());
                        if !self
                            .contains_ontology_type(OntologyTypeReference::PropertyTypeReference(
                                &property_type_reference,
                            ))
                            .await?
                        {
                            let metadata = ExternalOntologyElementMetadata::new(
                                property_type.id().clone().into(),
                                provenance_metadata,
                                fetched_ontology_type.fetched_at,
                            );

                            property_types
                                .push((property_type, OntologyElementMetadata::External(metadata)));
                        }
                    }
                    OntologyType::EntityType(entity_type) => {
                        let entity_type = EntityType::try_from(entity_type)
                            .into_report()
                            .change_context(StoreError)?;
                        let entity_type_reference =
                            EntityTypeReference::new(entity_type.id().clone());
                        if !self
                            .contains_ontology_type(OntologyTypeReference::EntityTypeReference(
                                &entity_type_reference,
                            ))
                            .await?
                        {
                            let metadata = ExternalOntologyElementMetadata::new(
                                entity_type.id().clone().into(),
                                provenance_metadata,
                                fetched_ontology_type.fetched_at,
                            );

                            entity_types
                                .push((entity_type, OntologyElementMetadata::External(metadata)));
                        }
                    }
                }
            }
        }

        Ok((data_types, property_types, entity_types))
    }

    async fn insert_external_types<'o, T: crate::ontology::OntologyType + Sync + 'o>(
        &mut self,
        ontology_types: impl IntoIterator<Item = (&'o T, UpdatedById), IntoIter: Send> + Send,
    ) -> Result<(), InsertionError> {
        // Without collecting it first, we get a "Higher-ranked lifetime error" because of the
        // limitations of Rust being able to look into a `Pin<Box<dyn Future>>`, which is returned
        // by `#[async_trait]` methods.
        let ontology_types = ontology_types.into_iter().collect::<Vec<_>>();

        let mut ontology_types_to_fetch = Vec::new();
        for (ontology_type, fetched_by) in ontology_types {
            ontology_types_to_fetch.extend(
                self.collect_external_ontology_types(ontology_type)
                    .await
                    .change_context(InsertionError)?
                    .into_iter()
                    .map(|ontology_type| (ontology_type, fetched_by)),
            );
        }

        if ontology_types_to_fetch.is_empty() {
            return Ok(());
        }

        let (fetched_data_types, fetched_property_types, fetched_entity_types) = self
            .fetch_external_ontology_types(ontology_types_to_fetch)
            .await
            .change_context(InsertionError)?;

        self.store.create_data_types(fetched_data_types).await?;
        self.store
            .create_property_types(fetched_property_types)
            .await?;
        self.store.create_entity_types(fetched_entity_types).await?;

        Ok(())
    }

    async fn insert_external_types_by_reference(
        &mut self,
        reference: OntologyTypeReference<'_>,
        fetched_by: UpdatedById,
    ) -> Result<(), InsertionError> {
        if !self
            .contains_ontology_type(reference)
            .await
            .change_context(InsertionError)?
        {
            let (fetched_data_types, fetched_property_types, fetched_entity_types) = self
                .fetch_external_ontology_types(once((reference, fetched_by)))
                .await
                .change_context(InsertionError)?;

            self.store.create_data_types(fetched_data_types).await?;
            self.store
                .create_property_types(fetched_property_types)
                .await?;
            self.store.create_entity_types(fetched_entity_types).await?;
        }

        Ok(())
    }
}

#[async_trait]
impl<S, A, R: Record> Read<R> for FetchingStore<S, A>
where
    A: Send + Sync,
    S: Read<R> + Send,
{
    async fn read(
        &self,
        query: &Filter<R>,
        temporal_axes: &QueryTemporalAxes,
    ) -> Result<Vec<R>, QueryError> {
        self.store.read(query, temporal_axes).await
    }
}

#[async_trait]
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
        data_types: impl IntoIterator<
            Item = (DataType, impl Borrow<OntologyElementMetadata> + Send + Sync),
            IntoIter: Send,
        > + Send,
    ) -> Result<(), InsertionError> {
        let data_types = data_types.into_iter().collect::<Vec<_>>();

        self.insert_external_types(data_types.iter().map(|(data_type, metadata)| {
            (
                data_type,
                metadata.borrow().provenance_metadata().updated_by_id(),
            )
        }))
        .await?;

        self.store.create_data_types(data_types).await
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
        actor_id: UpdatedById,
    ) -> Result<OntologyElementMetadata, UpdateError> {
        self.insert_external_types(once((&data_type, actor_id)))
            .await
            .change_context(UpdateError)?;

        self.store.update_data_type(data_type, actor_id).await
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
            Item = (
                PropertyType,
                impl Borrow<OntologyElementMetadata> + Send + Sync,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<(), InsertionError> {
        let property_types = property_types.into_iter().collect::<Vec<_>>();

        self.insert_external_types(property_types.iter().map(|(property_type, metadata)| {
            (
                property_type,
                metadata.borrow().provenance_metadata().updated_by_id(),
            )
        }))
        .await?;

        self.store.create_property_types(property_types).await
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
        actor_id: UpdatedById,
    ) -> Result<OntologyElementMetadata, UpdateError> {
        self.insert_external_types(once((&property_type, actor_id)))
            .await
            .change_context(UpdateError)?;

        self.store
            .update_property_type(property_type, actor_id)
            .await
    }
}

#[async_trait]
impl<S, A> EntityTypeStore for FetchingStore<S, A>
where
    S: DataTypeStore + PropertyTypeStore + EntityTypeStore + Send,
    A: ToSocketAddrs + Send + Sync,
{
    async fn create_entity_types(
        &mut self,
        entity_types: impl IntoIterator<
            Item = (
                EntityType,
                impl Borrow<OntologyElementMetadata> + Send + Sync,
            ),
            IntoIter: Send,
        > + Send,
    ) -> Result<(), InsertionError> {
        let entity_types = entity_types.into_iter().collect::<Vec<_>>();

        self.insert_external_types(entity_types.iter().map(|(entity_type, metadata)| {
            (
                entity_type,
                metadata.borrow().provenance_metadata().updated_by_id(),
            )
        }))
        .await?;

        self.store.create_entity_types(entity_types).await
    }

    async fn get_entity_type(
        &self,
        query: &StructuralQuery<EntityTypeWithMetadata>,
    ) -> Result<Subgraph, QueryError> {
        self.store.get_entity_type(query).await
    }

    async fn update_entity_type(
        &mut self,
        entity_type: EntityType,
        actor_id: UpdatedById,
    ) -> Result<OntologyElementMetadata, UpdateError> {
        self.insert_external_types(once((&entity_type, actor_id)))
            .await
            .change_context(UpdateError)?;

        self.store.update_entity_type(entity_type, actor_id).await
    }
}

#[async_trait]
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
        updated_by_id: UpdatedById,
        archived: bool,
        entity_type_id: VersionedUrl,
        properties: EntityProperties,
        link_data: Option<LinkData>,
    ) -> Result<EntityMetadata, InsertionError> {
        let entity_type_reference = EntityTypeReference::new(entity_type_id.clone());
        self.insert_external_types_by_reference(
            OntologyTypeReference::EntityTypeReference(&entity_type_reference),
            updated_by_id,
        )
        .await?;

        self.store
            .create_entity(
                owned_by_id,
                entity_uuid,
                decision_time,
                updated_by_id,
                archived,
                entity_type_id,
                properties,
                link_data,
            )
            .await
    }

    #[cfg(feature = "__internal_bench")]
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
        actor_id: UpdatedById,
        entity_type_id: &VersionedUrl,
    ) -> Result<Vec<EntityMetadata>, InsertionError> {
        let entity_type_reference = EntityTypeReference::new(entity_type_id.clone());
        self.insert_external_types_by_reference(
            OntologyTypeReference::EntityTypeReference(&entity_type_reference),
            actor_id,
        )
        .await?;

        self.store
            .insert_entities_batched_by_type(entities, actor_id, entity_type_id)
            .await
    }

    async fn get_entity(&self, query: &StructuralQuery<Entity>) -> Result<Subgraph, QueryError> {
        self.store.get_entity(query).await
    }

    async fn update_entity(
        &mut self,
        entity_id: EntityId,
        decision_time: Option<Timestamp<DecisionTime>>,
        updated_by_id: UpdatedById,
        archived: bool,
        entity_type_id: VersionedUrl,
        properties: EntityProperties,
        link_order: EntityLinkOrder,
    ) -> Result<EntityMetadata, UpdateError> {
        let entity_type_reference = EntityTypeReference::new(entity_type_id.clone());
        self.insert_external_types_by_reference(
            OntologyTypeReference::EntityTypeReference(&entity_type_reference),
            updated_by_id,
        )
        .await
        .change_context(UpdateError)?;

        self.store
            .update_entity(
                entity_id,
                decision_time,
                updated_by_id,
                archived,
                entity_type_id,
                properties,
                link_order,
            )
            .await
    }
}
