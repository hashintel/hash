#![feature(
    // Library Features
    assert_matches,
)]
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

use std::collections::{HashMap, HashSet};

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::policies::{
    principal::actor::AuthenticatedActor,
    store::{PolicyStore as _, PrincipalStore as _},
};
use hash_graph_postgres_store::{
    Environment, load_env,
    store::{
        DatabaseConnectionInfo, DatabasePoolConfig, DatabaseType, PostgresStore, PostgresStorePool,
        PostgresStoreSettings,
    },
};
use hash_graph_store::{
    account::{AccountStore as _, CreateUserActorParams},
    data_type::{
        ArchiveDataTypeParams, CountDataTypesParams, CreateDataTypeParams, DataTypeStore,
        FindDataTypeConversionTargetsParams, FindDataTypeConversionTargetsResponse,
        HasPermissionForDataTypesParams, QueryDataTypeSubgraphParams,
        QueryDataTypeSubgraphResponse, QueryDataTypesParams, QueryDataTypesResponse,
        UnarchiveDataTypeParams, UpdateDataTypeEmbeddingParams, UpdateDataTypesParams,
    },
    entity::{
        CountEntitiesParams, CreateEntityParams, EntityStore, EntityValidationReport,
        HasPermissionForEntitiesParams, PatchEntityParams, QueryEntitiesParams,
        QueryEntitiesResponse, QueryEntitySubgraphParams, QueryEntitySubgraphResponse,
        UpdateEntityEmbeddingsParams, ValidateEntityParams,
    },
    entity_type::{
        ArchiveEntityTypeParams, CountEntityTypesParams, CreateEntityTypeParams, EntityTypeStore,
        GetClosedMultiEntityTypesResponse, HasPermissionForEntityTypesParams,
        IncludeResolvedEntityTypeOption, QueryEntityTypeSubgraphParams,
        QueryEntityTypeSubgraphResponse, QueryEntityTypesParams, QueryEntityTypesResponse,
        UnarchiveEntityTypeParams, UpdateEntityTypeEmbeddingParams, UpdateEntityTypesParams,
    },
    error::{CheckPermissionError, InsertionError, QueryError, UpdateError},
    pool::StorePool,
    property_type::{
        ArchivePropertyTypeParams, CountPropertyTypesParams, CreatePropertyTypeParams,
        HasPermissionForPropertyTypesParams, PropertyTypeStore, QueryPropertyTypeSubgraphParams,
        QueryPropertyTypeSubgraphResponse, QueryPropertyTypesParams, QueryPropertyTypesResponse,
        UnarchivePropertyTypeParams, UpdatePropertyTypeEmbeddingParams, UpdatePropertyTypesParams,
    },
    query::ConflictBehavior,
    subgraph::temporal_axes::QueryTemporalAxesUnresolved,
};
use hash_graph_temporal_versioning::{DecisionTime, Timestamp, TransactionTime};
use hash_telemetry::logging::env_filter;
use tokio_postgres::{NoTls, Transaction};
use type_system::{
    knowledge::entity::{Entity, EntityId, id::EntityEditionId},
    ontology::{
        OntologyTemporalMetadata, VersionedUrl,
        data_type::{DataType, DataTypeMetadata},
        entity_type::{EntityType, EntityTypeMetadata},
        property_type::{PropertyType, PropertyTypeMetadata},
        provenance::{OntologyOwnership, ProvidedOntologyEditionProvenance},
    },
    principal::actor::{ActorEntityUuid, ActorType},
    provenance::{OriginProvenance, OriginType},
};

pub struct DatabaseTestWrapper {
    _pool: PostgresStorePool,
    connection: <PostgresStorePool as StorePool>::Store<'static>,
}

pub struct DatabaseApi<'pool> {
    store: PostgresStore<Transaction<'pool>>,
    account_id: ActorEntityUuid,
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

impl DatabaseTestWrapper {
    pub async fn new() -> Self {
        load_env(Environment::Test);
        init_logging();

        let user = std::env::var("HASH_GRAPH_PG_USER").unwrap_or_else(|_| "graph".to_owned());
        let password =
            std::env::var("HASH_GRAPH_PG_PASSWORD").unwrap_or_else(|_| "graph".to_owned());
        let host = std::env::var("HASH_GRAPH_PG_HOST").unwrap_or_else(|_| "localhost".to_owned());
        let port =
            std::env::var("HASH_GRAPH_PG_PORT").map_or(5432, |port| port.parse::<u16>().unwrap());
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

        let pool = PostgresStorePool::new(
            &connection_info,
            &DatabasePoolConfig::default(),
            NoTls,
            PostgresStoreSettings::default(),
        )
        .await
        .expect("could not connect to database");

        let connection = pool
            .acquire_owned(None)
            .await
            .expect("could not acquire a database connection");

        Self {
            _pool: pool,
            connection,
        }
    }
}

impl DatabaseTestWrapper {
    pub async fn seed<D, P, E>(
        &mut self,
        data_types: D,
        property_types: P,
        entity_types: E,
    ) -> Result<DatabaseApi<'_>, Report<InsertionError>>
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

        store
            .seed_system_policies()
            .await
            .expect("Should be able to seed system policies");

        let system_account_id = store
            .get_or_create_system_machine("h")
            .await
            .change_context(InsertionError)?;
        let user_id = store
            .create_user_actor(
                system_account_id.into(),
                CreateUserActorParams {
                    user_id: None,
                    shortname: Some("bench-user".to_owned()),
                    registration_complete: true,
                },
            )
            .await
            .change_context(InsertionError)?
            .user_id;

        store
            .create_data_types(
                user_id.into(),
                data_types.into_iter().map(|data_type_str| {
                    let schema: DataType = serde_json::from_str(data_type_str)
                        .expect("could not parse data type representation");
                    CreateDataTypeParams {
                        schema,
                        ownership: OntologyOwnership::Local {
                            web_id: user_id.into(),
                        },
                        conflict_behavior: ConflictBehavior::Skip,
                        provenance: ProvidedOntologyEditionProvenance {
                            actor_type: ActorType::User,
                            origin: OriginProvenance::from_empty_type(OriginType::Api),
                            sources: Vec::new(),
                        },
                        conversions: HashMap::new(),
                    }
                }),
            )
            .await?;

        store
            .create_property_types(
                user_id.into(),
                property_types.into_iter().map(|property_type_str| {
                    let schema: PropertyType = serde_json::from_str(property_type_str)
                        .expect("could not property data type representation");
                    CreatePropertyTypeParams {
                        schema,
                        ownership: OntologyOwnership::Local {
                            web_id: user_id.into(),
                        },
                        conflict_behavior: ConflictBehavior::Skip,
                        provenance: ProvidedOntologyEditionProvenance {
                            actor_type: ActorType::User,
                            origin: OriginProvenance::from_empty_type(OriginType::Api),
                            sources: Vec::new(),
                        },
                    }
                }),
            )
            .await?;

        store
            .create_entity_types(
                user_id.into(),
                entity_types.into_iter().map(|entity_type_str| {
                    let schema: EntityType = serde_json::from_str(entity_type_str)
                        .expect("could not entity data type representation");
                    CreateEntityTypeParams {
                        schema,
                        ownership: OntologyOwnership::Local {
                            web_id: user_id.into(),
                        },
                        conflict_behavior: ConflictBehavior::Skip,
                        provenance: ProvidedOntologyEditionProvenance {
                            actor_type: ActorType::User,
                            origin: OriginProvenance::from_empty_type(OriginType::Api),
                            sources: Vec::new(),
                        },
                    }
                }),
            )
            .await?;

        Ok(DatabaseApi {
            store,
            account_id: user_id.into(),
        })
    }
}

impl DataTypeStore for DatabaseApi<'_> {
    async fn create_data_types<P>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<DataTypeMetadata>, Report<InsertionError>>
    where
        P: IntoIterator<Item = CreateDataTypeParams, IntoIter: Send> + Send,
    {
        self.store.create_data_types(actor_id, params).await
    }

    async fn count_data_types(
        &self,
        actor_id: ActorEntityUuid,
        params: CountDataTypesParams<'_>,
    ) -> Result<usize, Report<QueryError>> {
        self.store.count_data_types(actor_id, params).await
    }

    async fn query_data_types(
        &self,
        actor_id: ActorEntityUuid,
        mut params: QueryDataTypesParams<'_>,
    ) -> Result<QueryDataTypesResponse, Report<QueryError>> {
        let include_count = params.include_count;
        let has_limit = params.limit.is_some();
        params.include_count = true;

        let count = self
            .count_data_types(
                actor_id,
                CountDataTypesParams {
                    filter: params.filter.clone(),
                    temporal_axes: params.temporal_axes,
                },
            )
            .await?;

        let mut response = self.store.query_data_types(actor_id, params).await?;

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

    async fn query_data_type_subgraph(
        &self,
        actor_id: ActorEntityUuid,
        mut params: QueryDataTypeSubgraphParams<'_>,
    ) -> Result<QueryDataTypeSubgraphResponse, Report<QueryError>> {
        let request = params.request_mut();
        let include_count = request.include_count;
        let has_limit = request.limit.is_some();
        request.include_count = true;

        let count = self
            .count_data_types(
                actor_id,
                CountDataTypesParams {
                    filter: request.filter.clone(),
                    temporal_axes: request.temporal_axes,
                },
            )
            .await?;

        let mut response = self
            .store
            .query_data_type_subgraph(actor_id, params)
            .await?;

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

    async fn update_data_types<P>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<DataTypeMetadata>, Report<UpdateError>>
    where
        P: IntoIterator<Item = UpdateDataTypesParams, IntoIter: Send> + Send,
    {
        self.store.update_data_types(actor_id, params).await
    }

    async fn archive_data_type(
        &mut self,
        actor_id: ActorEntityUuid,
        params: ArchiveDataTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, Report<UpdateError>> {
        self.store.archive_data_type(actor_id, params).await
    }

    async fn unarchive_data_type(
        &mut self,
        actor_id: ActorEntityUuid,
        params: UnarchiveDataTypeParams,
    ) -> Result<OntologyTemporalMetadata, Report<UpdateError>> {
        self.store.unarchive_data_type(actor_id, params).await
    }

    async fn update_data_type_embeddings(
        &mut self,
        actor_id: ActorEntityUuid,
        params: UpdateDataTypeEmbeddingParams<'_>,
    ) -> Result<(), Report<UpdateError>> {
        self.store
            .update_data_type_embeddings(actor_id, params)
            .await
    }

    async fn find_data_type_conversion_targets(
        &self,
        actor_id: ActorEntityUuid,
        params: FindDataTypeConversionTargetsParams,
    ) -> Result<FindDataTypeConversionTargetsResponse, Report<QueryError>> {
        self.store
            .find_data_type_conversion_targets(actor_id, params)
            .await
    }

    async fn reindex_data_type_cache(&mut self) -> Result<(), Report<UpdateError>> {
        self.store.reindex_entity_type_cache().await
    }

    async fn has_permission_for_data_types(
        &self,
        authenticated_actor: AuthenticatedActor,
        params: HasPermissionForDataTypesParams<'_>,
    ) -> Result<HashSet<VersionedUrl>, Report<CheckPermissionError>> {
        self.store
            .has_permission_for_data_types(authenticated_actor, params)
            .await
    }
}

impl PropertyTypeStore for DatabaseApi<'_> {
    async fn create_property_types<P>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<PropertyTypeMetadata>, Report<InsertionError>>
    where
        P: IntoIterator<Item = CreatePropertyTypeParams, IntoIter: Send> + Send,
    {
        self.store.create_property_types(actor_id, params).await
    }

    async fn count_property_types(
        &self,
        actor_id: ActorEntityUuid,
        params: CountPropertyTypesParams<'_>,
    ) -> Result<usize, Report<QueryError>> {
        self.store.count_property_types(actor_id, params).await
    }

    async fn query_property_types(
        &self,
        actor_id: ActorEntityUuid,
        mut params: QueryPropertyTypesParams<'_>,
    ) -> Result<QueryPropertyTypesResponse, Report<QueryError>> {
        let include_count = params.include_count;
        let has_limit = params.limit.is_some();
        params.include_count = true;

        let count = self
            .count_property_types(
                actor_id,
                CountPropertyTypesParams {
                    filter: params.filter.clone(),
                    temporal_axes: params.temporal_axes,
                },
            )
            .await?;

        let mut response = self.store.query_property_types(actor_id, params).await?;

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

    async fn query_property_type_subgraph(
        &self,
        actor_id: ActorEntityUuid,
        mut params: QueryPropertyTypeSubgraphParams<'_>,
    ) -> Result<QueryPropertyTypeSubgraphResponse, Report<QueryError>> {
        let request = params.request_mut();

        let include_count = request.include_count;
        let has_limit = request.limit.is_some();
        request.include_count = true;

        let count = self
            .count_property_types(
                actor_id,
                CountPropertyTypesParams {
                    filter: request.filter.clone(),
                    temporal_axes: request.temporal_axes,
                },
            )
            .await?;

        let mut response = self
            .store
            .query_property_type_subgraph(actor_id, params)
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

    async fn update_property_types<P>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<PropertyTypeMetadata>, Report<UpdateError>>
    where
        P: IntoIterator<Item = UpdatePropertyTypesParams, IntoIter: Send> + Send,
    {
        self.store.update_property_types(actor_id, params).await
    }

    async fn archive_property_type(
        &mut self,
        actor_id: ActorEntityUuid,
        params: ArchivePropertyTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, Report<UpdateError>> {
        self.store.archive_property_type(actor_id, params).await
    }

    async fn unarchive_property_type(
        &mut self,
        actor_id: ActorEntityUuid,
        params: UnarchivePropertyTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, Report<UpdateError>> {
        self.store.unarchive_property_type(actor_id, params).await
    }

    async fn update_property_type_embeddings(
        &mut self,
        actor_id: ActorEntityUuid,
        params: UpdatePropertyTypeEmbeddingParams<'_>,
    ) -> Result<(), Report<UpdateError>> {
        self.store
            .update_property_type_embeddings(actor_id, params)
            .await
    }

    async fn has_permission_for_property_types(
        &self,
        authenticated_actor: AuthenticatedActor,
        params: HasPermissionForPropertyTypesParams<'_>,
    ) -> Result<HashSet<VersionedUrl>, Report<CheckPermissionError>> {
        self.store
            .has_permission_for_property_types(authenticated_actor, params)
            .await
    }
}

impl EntityTypeStore for DatabaseApi<'_> {
    async fn create_entity_types<P>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<EntityTypeMetadata>, Report<InsertionError>>
    where
        P: IntoIterator<Item = CreateEntityTypeParams, IntoIter: Send> + Send,
    {
        self.store.create_entity_types(actor_id, params).await
    }

    async fn count_entity_types(
        &self,
        actor_id: ActorEntityUuid,
        params: CountEntityTypesParams<'_>,
    ) -> Result<usize, Report<QueryError>> {
        self.store.count_entity_types(actor_id, params).await
    }

    async fn query_entity_types(
        &self,
        actor_id: ActorEntityUuid,
        mut params: QueryEntityTypesParams<'_>,
    ) -> Result<QueryEntityTypesResponse, Report<QueryError>> {
        let request = &mut params.request;

        let include_count = request.include_count;
        let has_limit = request.limit.is_some();
        request.include_count = true;

        let count = self
            .count_entity_types(
                actor_id,
                CountEntityTypesParams {
                    filter: request.filter.clone(),
                    temporal_axes: request.temporal_axes,
                },
            )
            .await?;

        let mut response = self.store.query_entity_types(actor_id, params).await?;

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

    async fn get_closed_multi_entity_types<I, J>(
        &self,
        actor_id: ActorEntityUuid,
        entity_type_ids: I,
        temporal_axes: QueryTemporalAxesUnresolved,
        include_resolved: Option<IncludeResolvedEntityTypeOption>,
    ) -> Result<GetClosedMultiEntityTypesResponse, Report<QueryError>>
    where
        I: IntoIterator<Item = J> + Send,
        J: IntoIterator<Item = VersionedUrl> + Send,
    {
        self.store
            .get_closed_multi_entity_types(
                actor_id,
                entity_type_ids,
                temporal_axes,
                include_resolved,
            )
            .await
    }

    async fn query_entity_type_subgraph(
        &self,
        actor_id: ActorEntityUuid,
        mut params: QueryEntityTypeSubgraphParams<'_>,
    ) -> Result<QueryEntityTypeSubgraphResponse, Report<QueryError>> {
        let request = params.request_mut();

        let include_count = request.include_count;
        let has_limit = request.limit.is_some();
        request.include_count = true;

        let count = self
            .count_entity_types(
                actor_id,
                CountEntityTypesParams {
                    filter: request.filter.clone(),
                    temporal_axes: request.temporal_axes,
                },
            )
            .await?;

        let mut response = self
            .store
            .query_entity_type_subgraph(actor_id, params)
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

    async fn update_entity_types<P>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<EntityTypeMetadata>, Report<UpdateError>>
    where
        P: IntoIterator<Item = UpdateEntityTypesParams, IntoIter: Send> + Send,
    {
        self.store.update_entity_types(actor_id, params).await
    }

    async fn archive_entity_type(
        &mut self,
        actor_id: ActorEntityUuid,
        params: ArchiveEntityTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, Report<UpdateError>> {
        self.store.archive_entity_type(actor_id, params).await
    }

    async fn unarchive_entity_type(
        &mut self,
        actor_id: ActorEntityUuid,
        params: UnarchiveEntityTypeParams<'_>,
    ) -> Result<OntologyTemporalMetadata, Report<UpdateError>> {
        self.store.unarchive_entity_type(actor_id, params).await
    }

    async fn update_entity_type_embeddings(
        &mut self,
        actor_id: ActorEntityUuid,
        params: UpdateEntityTypeEmbeddingParams<'_>,
    ) -> Result<(), Report<UpdateError>> {
        self.store
            .update_entity_type_embeddings(actor_id, params)
            .await
    }

    async fn reindex_entity_type_cache(&mut self) -> Result<(), Report<UpdateError>> {
        self.store.reindex_entity_type_cache().await
    }

    async fn has_permission_for_entity_types(
        &self,
        authenticated_actor: AuthenticatedActor,
        params: HasPermissionForEntityTypesParams<'_>,
    ) -> Result<HashSet<VersionedUrl>, Report<CheckPermissionError>> {
        self.store
            .has_permission_for_entity_types(authenticated_actor, params)
            .await
    }
}

impl EntityStore for DatabaseApi<'_> {
    async fn create_entities(
        &mut self,
        actor_uuid: ActorEntityUuid,
        params: Vec<CreateEntityParams>,
    ) -> Result<Vec<Entity>, Report<InsertionError>> {
        self.store.create_entities(actor_uuid, params).await
    }

    async fn validate_entities(
        &self,
        actor_id: ActorEntityUuid,
        params: Vec<ValidateEntityParams<'_>>,
    ) -> Result<HashMap<usize, EntityValidationReport>, Report<QueryError>> {
        self.store.validate_entities(actor_id, params).await
    }

    async fn query_entities(
        &self,
        actor_id: ActorEntityUuid,
        mut params: QueryEntitiesParams<'_>,
    ) -> Result<QueryEntitiesResponse<'static>, Report<QueryError>> {
        let include_count = params.include_count;
        let has_limit = params.limit.is_some();
        params.include_count = true;

        let count = self
            .count_entities(
                actor_id,
                CountEntitiesParams {
                    filter: params.filter.clone(),
                    temporal_axes: params.temporal_axes,
                    include_drafts: params.include_drafts,
                },
            )
            .await?;

        let mut response = self.store.query_entities(actor_id, params).await?;

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

    async fn query_entity_subgraph(
        &self,
        actor_id: ActorEntityUuid,
        mut params: QueryEntitySubgraphParams<'_>,
    ) -> Result<QueryEntitySubgraphResponse<'static>, Report<QueryError>> {
        let request = params.request_mut();

        let include_count = request.include_count;
        let has_limit = request.limit.is_some();
        request.include_count = true;

        let count = self
            .count_entities(
                actor_id,
                CountEntitiesParams {
                    filter: request.filter.clone(),
                    temporal_axes: request.temporal_axes,
                    include_drafts: request.include_drafts,
                },
            )
            .await?;
        let mut response = self.store.query_entity_subgraph(actor_id, params).await?;

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
        actor_id: ActorEntityUuid,
        params: CountEntitiesParams<'_>,
    ) -> Result<usize, Report<QueryError>> {
        self.store.count_entities(actor_id, params).await
    }

    async fn get_entity_by_id(
        &self,
        actor_id: ActorEntityUuid,
        entity_id: EntityId,
        transaction_time: Option<Timestamp<TransactionTime>>,
        decision_time: Option<Timestamp<DecisionTime>>,
    ) -> Result<Entity, Report<QueryError>> {
        self.store
            .get_entity_by_id(actor_id, entity_id, transaction_time, decision_time)
            .await
    }

    async fn patch_entity(
        &mut self,
        actor_id: ActorEntityUuid,
        params: PatchEntityParams,
    ) -> Result<Entity, Report<UpdateError>> {
        self.store.patch_entity(actor_id, params).await
    }

    async fn update_entity_embeddings(
        &mut self,
        actor_id: ActorEntityUuid,
        params: UpdateEntityEmbeddingsParams<'_>,
    ) -> Result<(), Report<UpdateError>> {
        self.store.update_entity_embeddings(actor_id, params).await
    }

    async fn reindex_entity_cache(&mut self) -> Result<(), Report<UpdateError>> {
        self.store.reindex_entity_cache().await
    }

    async fn has_permission_for_entities(
        &self,
        authenticated_actor: AuthenticatedActor,
        params: HasPermissionForEntitiesParams<'_>,
    ) -> Result<HashMap<EntityId, Vec<EntityEditionId>>, Report<CheckPermissionError>> {
        self.store
            .has_permission_for_entities(authenticated_actor, params)
            .await
    }
}

#[tokio::test]
async fn can_connect() {
    DatabaseTestWrapper::new().await;
}
