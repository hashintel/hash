#![feature(assert_matches)]
#![expect(
    clippy::missing_panics_doc,
    clippy::missing_errors_doc,
    clippy::unwrap_used
)]
#![expect(
    clippy::significant_drop_tightening,
    reason = "This should be enabled but it's currently too noisy"
)]

extern crate alloc;
extern crate core;

mod data_type;
mod drafts;
mod entity;
mod entity_type;
mod interconnected_graph;
mod links;
mod multi_type;
mod partial_updates;
mod property_metadata;
mod property_type;
mod sorting;

use std::collections::HashMap;

use authorization::{
    AuthorizationApi, NoAuthorization,
    schema::{
        DataTypeRelationAndSubject, DataTypeViewerSubject, EntityRelationAndSubject,
        EntityTypeInstantiatorSubject, EntityTypeRelationAndSubject, EntityTypeSetting,
        EntityTypeSettingSubject, EntityTypeViewerSubject, PropertyTypeRelationAndSubject,
        PropertyTypeSetting, PropertyTypeSettingSubject, PropertyTypeViewerSubject,
        WebOwnerSubject,
    },
    zanzibar::Consistency,
};
use error_stack::Result;
use graph::{
    Environment, load_env,
    store::{
        DataTypeStore, DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, EntityStore,
        EntityTypeStore, InsertionError, PostgresStore, PostgresStorePool, PropertyTypeStore,
        QueryError, StorePool, UpdateError,
        knowledge::{
            CountEntitiesParams, CreateEntityParams, GetEntitiesParams, GetEntitiesResponse,
            GetEntitySubgraphParams, GetEntitySubgraphResponse, PatchEntityParams,
            UpdateEntityEmbeddingsParams, ValidateEntityError, ValidateEntityParams,
        },
        ontology::{
            ArchiveDataTypeParams, ArchiveEntityTypeParams, ArchivePropertyTypeParams,
            CountDataTypesParams, CountEntityTypesParams, CountPropertyTypesParams,
            CreateDataTypeParams, CreateEntityTypeParams, CreatePropertyTypeParams,
            GetClosedMultiEntityTypeParams, GetClosedMultiEntityTypeResponse,
            GetDataTypeSubgraphParams, GetDataTypeSubgraphResponse, GetDataTypesParams,
            GetDataTypesResponse, GetEntityTypeSubgraphParams, GetEntityTypeSubgraphResponse,
            GetEntityTypesParams, GetEntityTypesResponse, GetPropertyTypeSubgraphParams,
            GetPropertyTypeSubgraphResponse, GetPropertyTypesParams, GetPropertyTypesResponse,
            UnarchiveDataTypeParams, UnarchiveEntityTypeParams, UnarchivePropertyTypeParams,
            UpdateDataTypeEmbeddingParams, UpdateDataTypesParams, UpdateEntityTypeEmbeddingParams,
            UpdateEntityTypesParams, UpdatePropertyTypeEmbeddingParams, UpdatePropertyTypesParams,
        },
    },
};
use graph_types::{
    account::AccountId,
    knowledge::entity::{Entity, EntityId},
    ontology::{
        DataTypeMetadata, EntityTypeMetadata, OntologyTemporalMetadata,
        OntologyTypeClassificationMetadata, PropertyTypeMetadata,
        ProvidedOntologyEditionProvenance,
    },
    owned_by_id::OwnedById,
};
use hash_graph_store::{
    ConflictBehavior,
    account::{AccountStore, InsertAccountIdParams, InsertWebIdParams},
};
use hash_tracing::logging::env_filter;
use temporal_versioning::{DecisionTime, Timestamp, TransactionTime};
use tokio_postgres::{NoTls, Transaction};
use type_system::schema::{DataType, EntityType, PropertyType};
use uuid::Uuid;

pub struct DatabaseTestWrapper<A: AuthorizationApi> {
    _pool: PostgresStorePool,
    connection: <PostgresStorePool as StorePool>::Store<'static, A>,
}

pub struct DatabaseApi<'pool, A: AuthorizationApi> {
    store: PostgresStore<Transaction<'pool>, A>,
    account_id: AccountId,
}

const fn data_type_relationships() -> [DataTypeRelationAndSubject; 1] {
    [DataTypeRelationAndSubject::Viewer {
        subject: DataTypeViewerSubject::Public,
        level: 0,
    }]
}

const fn property_type_relationships() -> [PropertyTypeRelationAndSubject; 2] {
    [
        PropertyTypeRelationAndSubject::Setting {
            subject: PropertyTypeSettingSubject::Setting {
                id: PropertyTypeSetting::UpdateFromWeb,
            },
            level: 0,
        },
        PropertyTypeRelationAndSubject::Viewer {
            subject: PropertyTypeViewerSubject::Public,
            level: 0,
        },
    ]
}

const fn entity_type_relationships() -> [EntityTypeRelationAndSubject; 3] {
    [
        EntityTypeRelationAndSubject::Setting {
            subject: EntityTypeSettingSubject::Setting {
                id: EntityTypeSetting::UpdateFromWeb,
            },
            level: 0,
        },
        EntityTypeRelationAndSubject::Viewer {
            subject: EntityTypeViewerSubject::Public,
            level: 0,
        },
        EntityTypeRelationAndSubject::Instantiator {
            subject: EntityTypeInstantiatorSubject::Public,
            level: 0,
        },
    ]
}

pub fn init_logging() {
    // It's likely that the initialization failed due to a previous initialization attempt. In this
    // case, we can ignore the error.
    let _: core::result::Result<_, _> = tracing_subscriber::fmt()
        .with_ansi(true)
        .with_env_filter(env_filter(None))
        .with_file(true)
        .with_line_number(true)
        .with_test_writer()
        .try_init();
}

impl DatabaseTestWrapper<NoAuthorization> {
    pub async fn new() -> Self {
        load_env(Environment::Test);
        init_logging();

        let user = std::env::var("HASH_GRAPH_PG_USER").unwrap_or_else(|_| "graph".to_owned());
        let password =
            std::env::var("HASH_GRAPH_PG_PASSWORD").unwrap_or_else(|_| "graph".to_owned());
        let host = std::env::var("HASH_GRAPH_PG_HOST").unwrap_or_else(|_| "localhost".to_owned());
        let port = std::env::var("HASH_GRAPH_PG_PORT")
            .map(|port| port.parse::<u16>().unwrap())
            .unwrap_or(5432);
        let database =
            std::env::var("HASH_GRAPH_PG_DATABASE").unwrap_or_else(|_| "graph".to_owned());

        let connection_info = DatabaseConnectionInfo::new(
            DatabaseType::Postgres,
            user,
            password,
            host,
            port,
            database,
        );

        let pool = PostgresStorePool::new(&connection_info, &DatabasePoolConfig::default(), NoTls)
            .await
            .expect("could not connect to database");

        let connection = pool
            .acquire_owned(NoAuthorization, None)
            .await
            .expect("could not acquire a database connection");

        Self {
            _pool: pool,
            connection,
        }
    }
}

impl<A: AuthorizationApi> DatabaseTestWrapper<A> {
    pub async fn seed<D, P, E>(
        &mut self,
        data_types: D,
        property_types: P,
        entity_types: E,
    ) -> Result<DatabaseApi<'_, &mut A>, InsertionError>
    where
        D: IntoIterator<Item = &'static str, IntoIter: Send> + Send,
        P: IntoIterator<Item = &'static str, IntoIter: Send> + Send,
        E: IntoIterator<Item = &'static str, IntoIter: Send> + Send,
    {
        let mut store = self
            .connection
            .transaction()
            .await
            .expect("could not start test transaction");

        let account_id = AccountId::new(Uuid::new_v4());
        store
            .insert_account_id(account_id, InsertAccountIdParams { account_id })
            .await
            .expect("could not insert account id");
        store
            .insert_web_id(account_id, InsertWebIdParams {
                owned_by_id: OwnedById::new(account_id.into_uuid()),
                owner: WebOwnerSubject::Account { id: account_id },
            })
            .await
            .expect("could not create web id");

        store
            .create_data_types(
                account_id,
                data_types.into_iter().map(|data_type_str| {
                    let schema: DataType = serde_json::from_str(data_type_str)
                        .expect("could not parse data type representation");
                    CreateDataTypeParams {
                        schema,
                        classification: OntologyTypeClassificationMetadata::Owned {
                            owned_by_id: OwnedById::new(account_id.into_uuid()),
                        },
                        relationships: data_type_relationships(),
                        conflict_behavior: ConflictBehavior::Skip,
                        provenance: ProvidedOntologyEditionProvenance::default(),
                        conversions: HashMap::new(),
                    }
                }),
            )
            .await?;

        store
            .create_property_types(
                account_id,
                property_types.into_iter().map(|property_type_str| {
                    let schema: PropertyType = serde_json::from_str(property_type_str)
                        .expect("could not property data type representation");
                    CreatePropertyTypeParams {
                        schema,
                        classification: OntologyTypeClassificationMetadata::Owned {
                            owned_by_id: OwnedById::new(account_id.into_uuid()),
                        },
                        relationships: property_type_relationships(),
                        conflict_behavior: ConflictBehavior::Skip,
                        provenance: ProvidedOntologyEditionProvenance::default(),
                    }
                }),
            )
            .await?;

        store
            .create_entity_types(
                account_id,
                entity_types.into_iter().map(|entity_type_str| {
                    let schema: EntityType = serde_json::from_str(entity_type_str)
                        .expect("could not entity data type representation");
                    CreateEntityTypeParams {
                        schema,
                        classification: OntologyTypeClassificationMetadata::Owned {
                            owned_by_id: OwnedById::new(account_id.into_uuid()),
                        },
                        relationships: entity_type_relationships(),
                        conflict_behavior: ConflictBehavior::Skip,
                        provenance: ProvidedOntologyEditionProvenance::default(),
                    }
                }),
            )
            .await?;

        Ok(DatabaseApi { store, account_id })
    }
}

impl<A: AuthorizationApi> DataTypeStore for DatabaseApi<'_, A> {
    async fn create_data_types<P, R>(
        &mut self,
        actor_id: AccountId,
        params: P,
    ) -> Result<Vec<DataTypeMetadata>, InsertionError>
    where
        P: IntoIterator<Item = CreateDataTypeParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = DataTypeRelationAndSubject> + Send + Sync,
    {
        self.store.create_data_types(actor_id, params).await
    }

    async fn count_data_types(
        &self,
        actor_id: AccountId,
        params: CountDataTypesParams<'_>,
    ) -> Result<usize, QueryError> {
        self.store.count_data_types(actor_id, params).await
    }

    async fn get_data_types(
        &self,
        actor_id: AccountId,
        mut params: GetDataTypesParams<'_>,
    ) -> Result<GetDataTypesResponse, QueryError> {
        let include_count = params.include_count;
        let has_limit = params.limit.is_some();
        params.include_count = true;

        let count = self
            .count_data_types(actor_id, CountDataTypesParams {
                filter: params.filter.clone(),
                temporal_axes: params.temporal_axes.clone(),
                include_drafts: params.include_drafts,
            })
            .await?;

        let mut response = self.store.get_data_types(actor_id, params).await?;

        // We can ensure that `count_data_types` and `get_data_types` return the same count;
        assert_eq!(response.count, Some(count));
        // if the limit is not set, the count should be equal to the number of data types returned
        if !has_limit {
            assert_eq!(count, response.data_types.len());
        }

        if !include_count {
            response.count = None;
        }
        Ok(response)
    }

    async fn get_data_type_subgraph(
        &self,
        actor_id: AccountId,
        mut params: GetDataTypeSubgraphParams<'_>,
    ) -> Result<GetDataTypeSubgraphResponse, QueryError> {
        let include_count = params.include_count;
        let has_limit = params.limit.is_some();
        params.include_count = true;

        let count = self
            .count_data_types(actor_id, CountDataTypesParams {
                filter: params.filter.clone(),
                temporal_axes: params.temporal_axes.clone(),
                include_drafts: params.include_drafts,
            })
            .await?;

        let mut response = self.store.get_data_type_subgraph(actor_id, params).await?;

        // We can ensure that `count_data_types` and `get_data_type_subgraph` return the same count;
        assert_eq!(response.count, Some(count));
        // if the limit is not set, the count should be equal to the number of data types returned
        if !has_limit {
            assert_eq!(count, response.subgraph.roots.len());
        }

        if !include_count {
            response.count = None;
        }
        Ok(response)
    }

    async fn update_data_type<R>(
        &mut self,
        actor_id: AccountId,
        params: UpdateDataTypesParams<R>,
    ) -> Result<DataTypeMetadata, UpdateError>
    where
        R: IntoIterator<Item = DataTypeRelationAndSubject> + Send + Sync,
    {
        self.store.update_data_type(actor_id, params).await
    }

    async fn archive_data_type(
        &mut self,
        actor_id: AccountId,
        params: ArchiveDataTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.store.archive_data_type(actor_id, params).await
    }

    async fn unarchive_data_type(
        &mut self,
        actor_id: AccountId,
        params: UnarchiveDataTypeParams,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.store.unarchive_data_type(actor_id, params).await
    }

    async fn update_data_type_embeddings(
        &mut self,
        actor_id: AccountId,
        params: UpdateDataTypeEmbeddingParams<'_>,
    ) -> Result<(), UpdateError> {
        self.store
            .update_data_type_embeddings(actor_id, params)
            .await
    }

    async fn reindex_data_type_cache(&mut self) -> Result<(), UpdateError> {
        self.store.reindex_entity_type_cache().await
    }
}

impl<A: AuthorizationApi> PropertyTypeStore for DatabaseApi<'_, A> {
    async fn create_property_types<P, R>(
        &mut self,
        actor_id: AccountId,
        params: P,
    ) -> Result<Vec<PropertyTypeMetadata>, InsertionError>
    where
        P: IntoIterator<Item = CreatePropertyTypeParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = PropertyTypeRelationAndSubject> + Send + Sync,
    {
        self.store.create_property_types(actor_id, params).await
    }

    async fn count_property_types(
        &self,
        actor_id: AccountId,
        params: CountPropertyTypesParams<'_>,
    ) -> Result<usize, QueryError> {
        self.store.count_property_types(actor_id, params).await
    }

    async fn get_property_types(
        &self,
        actor_id: AccountId,
        mut params: GetPropertyTypesParams<'_>,
    ) -> Result<GetPropertyTypesResponse, QueryError> {
        let include_count = params.include_count;
        let has_limit = params.limit.is_some();
        params.include_count = true;

        let count = self
            .count_property_types(actor_id, CountPropertyTypesParams {
                filter: params.filter.clone(),
                temporal_axes: params.temporal_axes.clone(),
                include_drafts: params.include_drafts,
            })
            .await?;

        let mut response = self.store.get_property_types(actor_id, params).await?;

        // We can ensure that `count_property_types` and `get_property_types` return the same count;
        assert_eq!(response.count, Some(count));
        // if the limit is not set, the count should be equal to the number of property types
        // returned
        if !has_limit {
            assert_eq!(count, response.property_types.len());
        }

        if !include_count {
            response.count = None;
        }
        Ok(response)
    }

    async fn get_property_type_subgraph(
        &self,
        actor_id: AccountId,
        mut params: GetPropertyTypeSubgraphParams<'_>,
    ) -> Result<GetPropertyTypeSubgraphResponse, QueryError> {
        let include_count = params.include_count;
        let has_limit = params.limit.is_some();
        params.include_count = true;

        let count = self
            .count_property_types(actor_id, CountPropertyTypesParams {
                filter: params.filter.clone(),
                temporal_axes: params.temporal_axes.clone(),
                include_drafts: params.include_drafts,
            })
            .await?;

        let mut response = self
            .store
            .get_property_type_subgraph(actor_id, params)
            .await?;

        // We can ensure that `count_property_types` and `get_property_type_subgraph` return the
        // same count;
        assert_eq!(response.count, Some(count));
        // if the limit is not set, the count should be equal to the number of property types
        // returned
        if !has_limit {
            assert_eq!(count, response.subgraph.roots.len());
        }

        if !include_count {
            response.count = None;
        }
        Ok(response)
    }

    async fn update_property_type<R>(
        &mut self,
        actor_id: AccountId,
        params: UpdatePropertyTypesParams<R>,
    ) -> Result<PropertyTypeMetadata, UpdateError>
    where
        R: IntoIterator<Item = PropertyTypeRelationAndSubject> + Send + Sync,
    {
        self.store.update_property_type(actor_id, params).await
    }

    async fn archive_property_type(
        &mut self,
        actor_id: AccountId,
        params: ArchivePropertyTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.store.archive_property_type(actor_id, params).await
    }

    async fn unarchive_property_type(
        &mut self,
        actor_id: AccountId,
        params: UnarchivePropertyTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.store.unarchive_property_type(actor_id, params).await
    }

    async fn update_property_type_embeddings(
        &mut self,
        actor_id: AccountId,
        params: UpdatePropertyTypeEmbeddingParams<'_>,
    ) -> Result<(), UpdateError> {
        self.store
            .update_property_type_embeddings(actor_id, params)
            .await
    }
}

impl<A: AuthorizationApi> EntityTypeStore for DatabaseApi<'_, A> {
    async fn create_entity_types<P, R>(
        &mut self,
        actor_id: AccountId,
        params: P,
    ) -> Result<Vec<EntityTypeMetadata>, InsertionError>
    where
        P: IntoIterator<Item = CreateEntityTypeParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = EntityTypeRelationAndSubject> + Send + Sync,
    {
        self.store.create_entity_types(actor_id, params).await
    }

    async fn count_entity_types(
        &self,
        actor_id: AccountId,
        params: CountEntityTypesParams<'_>,
    ) -> Result<usize, QueryError> {
        self.store.count_entity_types(actor_id, params).await
    }

    async fn get_entity_types(
        &self,
        actor_id: AccountId,
        mut params: GetEntityTypesParams<'_>,
    ) -> Result<GetEntityTypesResponse, QueryError> {
        let include_count = params.include_count;
        let has_limit = params.limit.is_some();
        params.include_count = true;

        let count = self
            .count_entity_types(actor_id, CountEntityTypesParams {
                filter: params.filter.clone(),
                temporal_axes: params.temporal_axes.clone(),
                include_drafts: params.include_drafts,
            })
            .await?;

        let mut response = self.store.get_entity_types(actor_id, params).await?;

        // We can ensure that `count_entity_types` and `get_entity_types` return the same count;
        assert_eq!(response.count, Some(count));
        // if the limit is not set, the count should be equal to the number of entity types returned
        if !has_limit {
            assert_eq!(count, response.entity_types.len());
        }

        if !include_count {
            response.count = None;
        }
        Ok(response)
    }

    async fn get_closed_multi_entity_types(
        &self,
        actor_id: AccountId,
        params: GetClosedMultiEntityTypeParams,
    ) -> Result<GetClosedMultiEntityTypeResponse, QueryError> {
        self.store
            .get_closed_multi_entity_types(actor_id, params)
            .await
    }

    async fn get_entity_type_subgraph(
        &self,
        actor_id: AccountId,
        mut params: GetEntityTypeSubgraphParams<'_>,
    ) -> Result<GetEntityTypeSubgraphResponse, QueryError> {
        let include_count = params.include_count;
        let has_limit = params.limit.is_some();
        params.include_count = true;

        let count = self
            .count_entity_types(actor_id, CountEntityTypesParams {
                filter: params.filter.clone(),
                temporal_axes: params.temporal_axes.clone(),
                include_drafts: params.include_drafts,
            })
            .await?;

        let mut response = self
            .store
            .get_entity_type_subgraph(actor_id, params)
            .await?;

        // We can ensure that `count_entity_types` and `get_entity_type_subgraph` return the same
        // count;
        assert_eq!(response.count, Some(count));
        // if the limit is not set, the count should be equal to the number of entity types returned
        if !has_limit {
            assert_eq!(count, response.subgraph.roots.len());
        }

        if !include_count {
            response.count = None;
        }
        Ok(response)
    }

    async fn update_entity_type<R>(
        &mut self,
        actor_id: AccountId,
        params: UpdateEntityTypesParams<R>,
    ) -> Result<EntityTypeMetadata, UpdateError>
    where
        R: IntoIterator<Item = EntityTypeRelationAndSubject> + Send + Sync,
    {
        self.store.update_entity_type(actor_id, params).await
    }

    async fn archive_entity_type(
        &mut self,
        actor_id: AccountId,
        params: ArchiveEntityTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.store.archive_entity_type(actor_id, params).await
    }

    async fn unarchive_entity_type(
        &mut self,
        actor_id: AccountId,
        params: UnarchiveEntityTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, UpdateError> {
        self.store.unarchive_entity_type(actor_id, params).await
    }

    async fn update_entity_type_embeddings(
        &mut self,
        actor_id: AccountId,
        params: UpdateEntityTypeEmbeddingParams<'_>,
    ) -> Result<(), UpdateError> {
        self.store
            .update_entity_type_embeddings(actor_id, params)
            .await
    }

    async fn reindex_entity_type_cache(&mut self) -> Result<(), UpdateError> {
        self.store.reindex_entity_type_cache().await
    }
}

impl<A> EntityStore for DatabaseApi<'_, A>
where
    A: AuthorizationApi,
{
    async fn create_entities<R>(
        &mut self,
        actor_id: AccountId,
        params: Vec<CreateEntityParams<R>>,
    ) -> Result<Vec<Entity>, InsertionError>
    where
        R: IntoIterator<Item = EntityRelationAndSubject> + Send,
    {
        self.store.create_entities(actor_id, params).await
    }

    async fn validate_entities(
        &self,
        actor_id: AccountId,
        consistency: Consistency<'_>,
        params: Vec<ValidateEntityParams<'_>>,
    ) -> Result<(), ValidateEntityError> {
        self.store
            .validate_entities(actor_id, consistency, params)
            .await
    }

    async fn get_entities(
        &self,
        actor_id: AccountId,
        mut params: GetEntitiesParams<'_>,
    ) -> Result<GetEntitiesResponse<'static>, QueryError> {
        let include_count = params.include_count;
        let has_limit = params.limit.is_some();
        params.include_count = true;

        let count = self
            .count_entities(actor_id, CountEntitiesParams {
                filter: params.filter.clone(),
                temporal_axes: params.temporal_axes.clone(),
                include_drafts: params.include_drafts,
            })
            .await?;

        let mut response = self.store.get_entities(actor_id, params).await?;

        // We can ensure that `count_entities` and `get_entity` return the same count;
        assert_eq!(response.count, Some(count));
        // if the limit is not set, the count should be equal to the number of entities returned
        if !has_limit {
            assert_eq!(count, response.entities.len());
        }

        if !include_count {
            response.count = None;
        }
        Ok(response)
    }

    async fn get_entity_subgraph(
        &self,
        actor_id: AccountId,
        mut params: GetEntitySubgraphParams<'_>,
    ) -> Result<GetEntitySubgraphResponse<'static>, QueryError> {
        let include_count = params.include_count;
        let has_limit = params.limit.is_some();
        params.include_count = true;

        let count = self
            .count_entities(actor_id, CountEntitiesParams {
                filter: params.filter.clone(),
                temporal_axes: params.temporal_axes.clone(),
                include_drafts: params.include_drafts,
            })
            .await?;
        let mut response = self.store.get_entity_subgraph(actor_id, params).await?;

        // We can ensure that `count_entities` and `get_entity` return the same count;
        assert_eq!(response.count, Some(count));
        // if the limit is not set, the count should be equal to the number of entities returned
        if !has_limit {
            assert_eq!(count, response.subgraph.roots.len());
        }

        if !include_count {
            response.count = None;
        }
        Ok(response)
    }

    async fn count_entities(
        &self,
        actor_id: AccountId,
        params: CountEntitiesParams<'_>,
    ) -> Result<usize, QueryError> {
        self.store.count_entities(actor_id, params).await
    }

    async fn get_entity_by_id(
        &self,
        actor_id: AccountId,
        entity_id: EntityId,
        transaction_time: Option<Timestamp<TransactionTime>>,
        decision_time: Option<Timestamp<DecisionTime>>,
    ) -> Result<Entity, QueryError> {
        self.store
            .get_entity_by_id(actor_id, entity_id, transaction_time, decision_time)
            .await
    }

    async fn patch_entity(
        &mut self,
        actor_id: AccountId,
        params: PatchEntityParams,
    ) -> Result<Entity, UpdateError> {
        self.store.patch_entity(actor_id, params).await
    }

    async fn update_entity_embeddings(
        &mut self,
        actor_id: AccountId,
        params: UpdateEntityEmbeddingsParams<'_>,
    ) -> Result<(), UpdateError> {
        self.store.update_entity_embeddings(actor_id, params).await
    }

    async fn reindex_entity_cache(&mut self) -> Result<(), UpdateError> {
        self.store.reindex_entity_cache().await
    }
}

#[tokio::test]
async fn can_connect() {
    DatabaseTestWrapper::new().await;
}
