use std::borrow::Borrow;

use async_trait::async_trait;
use error_stack::{IntoReport, Result, ResultExt};
use tokio::net::ToSocketAddrs;
#[cfg(feature = "type-fetcher")]
use tokio_serde::formats::MessagePack;
#[cfg(feature = "type-fetcher")]
use type_fetcher::fetcher::FetcherClient;
use type_system::{uri::VersionedUri, DataType, EntityType, PropertyType};

use crate::{
    identifier::{
        account::AccountId,
        knowledge::EntityId,
        time::{DecisionTime, TimeProjection, Timestamp},
    },
    knowledge::{Entity, EntityLinkOrder, EntityMetadata, EntityProperties, EntityUuid, LinkData},
    ontology::{
        domain_validator::DomainValidator, DataTypeWithMetadata, EntityTypeWithMetadata,
        OntologyElementMetadata, PropertyTypeWithMetadata,
    },
    provenance::{OwnedById, UpdatedById},
    store::{
        crud::Read, query::Filter, AccountStore, DataTypeStore, EntityStore, EntityTypeStore,
        InsertionError, PropertyTypeStore, QueryError, Record, Store, StoreError, StorePool,
        UpdateError,
    },
    subgraph::{query::StructuralQuery, Subgraph},
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
    pub fn new(pool: P, address: A, domain_validator: DomainValidator) -> Result<Self, StoreError> {
        Ok(Self {
            pool,
            address,
            config: tarpc::client::Config::default(),
            domain_validator,
        })
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
    #[expect(
        dead_code,
        reason = "This will be used when dynamically using the type fetcher on creation or \
                  updating of a type"
    )]
    domain_validator: DomainValidator,
}

impl<S, A> FetchingStore<S, A>
where
    A: ToSocketAddrs,
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

    pub async fn store(&mut self) -> &mut S {
        &mut self.store
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
        time_projection: &TimeProjection,
    ) -> Result<Vec<R>, QueryError> {
        self.store.read(query, time_projection).await
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
    S: DataTypeStore + Send,
    A: Send + Sync,
{
    async fn create_data_types(
        &mut self,
        data_types: impl IntoIterator<
            Item = (DataType, impl Borrow<OntologyElementMetadata> + Send + Sync),
            IntoIter: Send,
        > + Send,
    ) -> Result<(), InsertionError> {
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
        self.store.update_data_type(data_type, actor_id).await
    }
}

#[async_trait]
impl<S, A> PropertyTypeStore for FetchingStore<S, A>
where
    S: PropertyTypeStore + Send,
    A: Send + Sync,
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
        self.store
            .update_property_type(property_type, actor_id)
            .await
    }
}

#[async_trait]
impl<S, A> EntityTypeStore for FetchingStore<S, A>
where
    S: EntityTypeStore + Send,
    A: Send + Sync,
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
        self.store.update_entity_type(entity_type, actor_id).await
    }
}

#[async_trait]
impl<S, A> EntityStore for FetchingStore<S, A>
where
    S: EntityStore + Send,
    A: Send + Sync,
{
    async fn create_entity(
        &mut self,
        owned_by_id: OwnedById,
        entity_uuid: Option<EntityUuid>,
        decision_time: Option<Timestamp<DecisionTime>>,
        updated_by_id: UpdatedById,
        archived: bool,
        entity_type_id: VersionedUri,
        properties: EntityProperties,
        link_data: Option<LinkData>,
    ) -> Result<EntityMetadata, InsertionError> {
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
        entity_type_id: &VersionedUri,
    ) -> Result<Vec<EntityMetadata>, InsertionError> {
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
        entity_type_id: VersionedUri,
        properties: EntityProperties,
        link_order: EntityLinkOrder,
    ) -> Result<EntityMetadata, UpdateError> {
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

#[async_trait]
impl<S, A> Store for FetchingStore<S, A>
where
    S: Store + Send,
    A: Send + Sync,
{
    type Transaction<'t> = S::Transaction<'t>
    where
        Self: 't;

    async fn transaction(&mut self) -> Result<Self::Transaction<'_>, StoreError> {
        self.store.transaction().await
    }
}
