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

use alloc::borrow::Cow;
use std::collections::HashMap;

use error_stack::{Report, ResultExt as _};
use hash_graph_authorization::{
    AuthorizationApi, NoAuthorization,
    policies::store::LocalPrincipalStore as _,
    schema::{
        DataTypeRelationAndSubject, DataTypeViewerSubject, EntityRelationAndSubject,
        EntityTypeInstantiatorSubject, EntityTypeRelationAndSubject, EntityTypeSetting,
        EntityTypeSettingSubject, EntityTypeViewerSubject, PropertyTypeRelationAndSubject,
        PropertyTypeSetting, PropertyTypeSettingSubject, PropertyTypeViewerSubject,
    },
    zanzibar::Consistency,
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
        GetDataTypeConversionTargetsParams, GetDataTypeConversionTargetsResponse,
        GetDataTypeSubgraphParams, GetDataTypeSubgraphResponse, GetDataTypesParams,
        GetDataTypesResponse, UnarchiveDataTypeParams, UpdateDataTypeEmbeddingParams,
        UpdateDataTypesParams,
    },
    entity::{
        CountEntitiesParams, CreateEntityParams, EntityStore, EntityValidationReport,
        GetEntitiesParams, GetEntitiesResponse, GetEntitySubgraphParams, GetEntitySubgraphResponse,
        PatchEntityParams, UpdateEntityEmbeddingsParams, ValidateEntityParams,
    },
    entity_type::{
        ArchiveEntityTypeParams, CountEntityTypesParams, CreateEntityTypeParams, EntityTypeStore,
        GetClosedMultiEntityTypesResponse, GetEntityTypeSubgraphParams,
        GetEntityTypeSubgraphResponse, GetEntityTypesParams, GetEntityTypesResponse,
        IncludeResolvedEntityTypeOption, UnarchiveEntityTypeParams,
        UpdateEntityTypeEmbeddingParams, UpdateEntityTypesParams,
    },
    error::{InsertionError, QueryError, UpdateError},
    pool::StorePool,
    property_type::{
        ArchivePropertyTypeParams, CountPropertyTypesParams, CreatePropertyTypeParams,
        GetPropertyTypeSubgraphParams, GetPropertyTypeSubgraphResponse, GetPropertyTypesParams,
        GetPropertyTypesResponse, PropertyTypeStore, UnarchivePropertyTypeParams,
        UpdatePropertyTypeEmbeddingParams, UpdatePropertyTypesParams,
    },
    query::ConflictBehavior,
    subgraph::temporal_axes::QueryTemporalAxesUnresolved,
};
use hash_graph_temporal_versioning::{DecisionTime, Timestamp, TransactionTime};
use hash_tracing::logging::env_filter;
use time::Duration;
use tokio_postgres::{NoTls, Transaction};
use type_system::{
    knowledge::entity::{Entity, EntityId},
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

pub struct DatabaseTestWrapper<A: AuthorizationApi> {
    _pool: PostgresStorePool,
    connection: <PostgresStorePool as StorePool>::Store<'static, A>,
}

pub struct DatabaseApi<'pool, A: AuthorizationApi> {
    store: PostgresStore<Transaction<'pool>, A>,
    account_id: ActorEntityUuid,
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

        let pool = PostgresStorePool::new(
            &connection_info,
            &DatabasePoolConfig::default(),
            NoTls,
            PostgresStoreSettings::default(),
        )
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
    ) -> Result<DatabaseApi<'_, &mut A>, Report<InsertionError>>
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

        let system_account_id = store
            .get_or_create_system_actor("h")
            .await
            .change_context(InsertionError)?;
        let user_id = store
            .create_user_actor(
                system_account_id.into(),
                CreateUserActorParams {
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
                        relationships: data_type_relationships(),
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
                        relationships: property_type_relationships(),
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
                        relationships: entity_type_relationships(),
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

impl<A: AuthorizationApi> DataTypeStore for DatabaseApi<'_, A> {
    async fn create_data_types<P, R>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<DataTypeMetadata>, Report<InsertionError>>
    where
        P: IntoIterator<Item = CreateDataTypeParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = DataTypeRelationAndSubject> + Send + Sync,
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

    async fn get_data_types(
        &self,
        actor_id: ActorEntityUuid,
        mut params: GetDataTypesParams<'_>,
    ) -> Result<GetDataTypesResponse, Report<QueryError>> {
        let include_count = params.include_count;
        let has_limit = params.limit.is_some();
        params.include_count = true;

        let count = self
            .count_data_types(
                actor_id,
                CountDataTypesParams {
                    filter: params.filter.clone(),
                    temporal_axes: params.temporal_axes.clone(),
                    include_drafts: params.include_drafts,
                },
            )
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
        actor_id: ActorEntityUuid,
        mut params: GetDataTypeSubgraphParams<'_>,
    ) -> Result<GetDataTypeSubgraphResponse, Report<QueryError>> {
        let include_count = params.include_count;
        let has_limit = params.limit.is_some();
        params.include_count = true;

        let count = self
            .count_data_types(
                actor_id,
                CountDataTypesParams {
                    filter: params.filter.clone(),
                    temporal_axes: params.temporal_axes.clone(),
                    include_drafts: params.include_drafts,
                },
            )
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

    async fn update_data_types<P, R>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<DataTypeMetadata>, Report<UpdateError>>
    where
        P: IntoIterator<Item = UpdateDataTypesParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = DataTypeRelationAndSubject> + Send + Sync,
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

    async fn get_data_type_conversion_targets(
        &self,
        actor_id: ActorEntityUuid,
        params: GetDataTypeConversionTargetsParams,
    ) -> Result<GetDataTypeConversionTargetsResponse, Report<QueryError>> {
        self.store
            .get_data_type_conversion_targets(actor_id, params)
            .await
    }

    async fn reindex_data_type_cache(&mut self) -> Result<(), Report<UpdateError>> {
        self.store.reindex_entity_type_cache().await
    }
}

impl<A: AuthorizationApi> PropertyTypeStore for DatabaseApi<'_, A> {
    async fn create_property_types<P, R>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<PropertyTypeMetadata>, Report<InsertionError>>
    where
        P: IntoIterator<Item = CreatePropertyTypeParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = PropertyTypeRelationAndSubject> + Send + Sync,
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

    async fn get_property_types(
        &self,
        actor_id: ActorEntityUuid,
        mut params: GetPropertyTypesParams<'_>,
    ) -> Result<GetPropertyTypesResponse, Report<QueryError>> {
        let include_count = params.include_count;
        let has_limit = params.limit.is_some();
        params.include_count = true;

        let count = self
            .count_property_types(
                actor_id,
                CountPropertyTypesParams {
                    filter: params.filter.clone(),
                    temporal_axes: params.temporal_axes.clone(),
                    include_drafts: params.include_drafts,
                },
            )
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
        actor_id: ActorEntityUuid,
        mut params: GetPropertyTypeSubgraphParams<'_>,
    ) -> Result<GetPropertyTypeSubgraphResponse, Report<QueryError>> {
        let include_count = params.include_count;
        let has_limit = params.limit.is_some();
        params.include_count = true;

        let count = self
            .count_property_types(
                actor_id,
                CountPropertyTypesParams {
                    filter: params.filter.clone(),
                    temporal_axes: params.temporal_axes.clone(),
                    include_drafts: params.include_drafts,
                },
            )
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

    async fn update_property_types<P, R>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<PropertyTypeMetadata>, Report<UpdateError>>
    where
        P: IntoIterator<Item = UpdatePropertyTypesParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = PropertyTypeRelationAndSubject> + Send + Sync,
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
}

impl<A: AuthorizationApi> EntityTypeStore for DatabaseApi<'_, A> {
    async fn create_entity_types<P, R>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<EntityTypeMetadata>, Report<InsertionError>>
    where
        P: IntoIterator<Item = CreateEntityTypeParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = EntityTypeRelationAndSubject> + Send + Sync,
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

    async fn get_entity_types(
        &self,
        actor_id: ActorEntityUuid,
        mut params: GetEntityTypesParams<'_>,
    ) -> Result<GetEntityTypesResponse, Report<QueryError>> {
        let include_count = params.include_count;
        let has_limit = params.limit.is_some();
        params.include_count = true;

        let count = self
            .count_entity_types(
                actor_id,
                CountEntityTypesParams {
                    filter: params.filter.clone(),
                    temporal_axes: params.temporal_axes.clone(),
                    include_drafts: params.include_drafts,
                },
            )
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

    async fn get_entity_type_subgraph(
        &self,
        actor_id: ActorEntityUuid,
        mut params: GetEntityTypeSubgraphParams<'_>,
    ) -> Result<GetEntityTypeSubgraphResponse, Report<QueryError>> {
        let include_count = params.include_count;
        let has_limit = params.limit.is_some();
        params.include_count = true;

        let count = self
            .count_entity_types(
                actor_id,
                CountEntityTypesParams {
                    filter: params.filter.clone(),
                    temporal_axes: params.temporal_axes.clone(),
                    include_drafts: params.include_drafts,
                },
            )
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

    async fn update_entity_types<P, R>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: P,
    ) -> Result<Vec<EntityTypeMetadata>, Report<UpdateError>>
    where
        P: IntoIterator<Item = UpdateEntityTypesParams<R>, IntoIter: Send> + Send,
        R: IntoIterator<Item = EntityTypeRelationAndSubject> + Send + Sync,
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

    async fn can_instantiate_entity_types(
        &self,
        authenticated_user: ActorEntityUuid,
        entity_type_ids: &[VersionedUrl],
    ) -> Result<Vec<bool>, Report<QueryError>> {
        self.store
            .can_instantiate_entity_types(authenticated_user, entity_type_ids)
            .await
    }
}

impl<A> EntityStore for DatabaseApi<'_, A>
where
    A: AuthorizationApi,
{
    async fn create_entities<R>(
        &mut self,
        actor_id: ActorEntityUuid,
        params: Vec<CreateEntityParams<R>>,
    ) -> Result<Vec<Entity>, Report<InsertionError>>
    where
        R: IntoIterator<Item = EntityRelationAndSubject> + Send + Sync,
    {
        self.store.create_entities(actor_id, params).await
    }

    async fn validate_entities(
        &self,
        actor_id: ActorEntityUuid,
        consistency: Consistency<'_>,
        params: Vec<ValidateEntityParams<'_>>,
    ) -> HashMap<usize, EntityValidationReport> {
        self.store
            .validate_entities(actor_id, consistency, params)
            .await
    }

    async fn get_entities(
        &self,
        actor_id: ActorEntityUuid,
        mut params: GetEntitiesParams<'_>,
    ) -> Result<GetEntitiesResponse<'static>, Report<QueryError>> {
        let include_count = params.include_count;
        let has_limit = params.limit.is_some();
        params.include_count = true;

        let count = self
            .count_entities(
                actor_id,
                CountEntitiesParams {
                    filter: params.filter.clone(),
                    temporal_axes: params.temporal_axes.clone(),
                    include_drafts: params.include_drafts,
                },
            )
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
        actor_id: ActorEntityUuid,
        mut params: GetEntitySubgraphParams<'_>,
    ) -> Result<GetEntitySubgraphResponse<'static>, Report<QueryError>> {
        let include_count = params.include_count;
        let has_limit = params.limit.is_some();
        params.include_count = true;

        let count = self
            .count_entities(
                actor_id,
                CountEntitiesParams {
                    filter: params.filter.clone(),
                    temporal_axes: params.temporal_axes.clone(),
                    include_drafts: params.include_drafts,
                },
            )
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
}

#[tokio::test]
async fn can_connect() {
    DatabaseTestWrapper::new().await;
}

fn assert_equal_entities(lhs: &Entity, rhs: &Entity) {
    use pretty_assertions::assert_eq;

    // It's possible that the time differs by less than a millisecond. If so, we copy the time from
    // the right-hand side to the left-hand side.
    let mut cloned = Cow::Borrowed(lhs);
    let lhs_metadata = &lhs.metadata.provenance.inferred;
    let rhs_metadata = &rhs.metadata.provenance.inferred;

    if (lhs_metadata.created_at_decision_time - rhs_metadata.created_at_decision_time).abs()
        < Duration::milliseconds(1)
    {
        cloned
            .to_mut()
            .metadata
            .provenance
            .inferred
            .created_at_decision_time = rhs_metadata.created_at_decision_time;
    }

    if (lhs_metadata.created_at_transaction_time - rhs_metadata.created_at_transaction_time).abs()
        < Duration::milliseconds(1)
    {
        cloned
            .to_mut()
            .metadata
            .provenance
            .inferred
            .created_at_transaction_time = rhs_metadata.created_at_transaction_time;
    }

    if let Some((lhs_time, rhs_time)) = lhs_metadata
        .first_non_draft_created_at_decision_time
        .zip(rhs_metadata.first_non_draft_created_at_decision_time)
        && (lhs_time - rhs_time).abs() < Duration::milliseconds(1)
    {
        cloned
            .to_mut()
            .metadata
            .provenance
            .inferred
            .first_non_draft_created_at_decision_time =
            rhs_metadata.first_non_draft_created_at_decision_time;
    }

    if let Some((lhs_time, rhs_time)) = lhs_metadata
        .first_non_draft_created_at_transaction_time
        .zip(rhs_metadata.first_non_draft_created_at_transaction_time)
        && (lhs_time - rhs_time).abs() < Duration::milliseconds(1)
    {
        cloned
            .to_mut()
            .metadata
            .provenance
            .inferred
            .first_non_draft_created_at_transaction_time =
            rhs_metadata.first_non_draft_created_at_transaction_time;
    }

    assert_eq!(*cloned, *rhs);
}
